import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, usm_company } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Company, CompanyStatus } from '../interfaces/company.interface';
import { CompanySettings } from '../interfaces/company-settings.interface';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { UpdateCompanySettingsDto } from '../dto/update-company-settings.dto';

// usm_company.status is a single-character column that pre-dates this app
// with a 'Y'/'N' convention (default 'Y'). There is no schema change here —
// this just extends that same column to a third value, 'S', for SUSPENDED.
// 'Y' keeps meaning exactly what it always has.
const STATUS_TO_CODE: Record<CompanyStatus, string> = { ACTIVE: 'Y', INACTIVE: 'N', SUSPENDED: 'S' };
const CODE_TO_STATUS: Record<string, CompanyStatus> = { Y: 'ACTIVE', N: 'INACTIVE', S: 'SUSPENDED' };

function toStatusCode(status: CompanyStatus): string {
  return STATUS_TO_CODE[status];
}

function fromStatusCode(code: string): CompanyStatus {
  // Defensive fallback only — every value this app writes is one of Y/N/S.
  return CODE_TO_STATUS[code] ?? 'INACTIVE';
}

// usm_users.is_admin / account_locked are VarChar(3) flag columns with no
// rows to inspect yet (usm_users is currently empty), so there is no real
// data to confirm the exact stored convention against. Every other
// flag/status column across the introspected schema (usm_company's various
// *_flag columns, pricing_master.status, integration_master.status, etc.)
// uses a plain 'Y'/'N' convention, so that's what's assumed here. If the
// real convention turns out different once usm_users has data, this is the
// one place to change.
const ADMIN_FLAG_VALUE = 'Y';
const LOCKED_FLAG_VALUE = 'Y';

/** Returned only by findForMobileLoginByShortname() — see that method's doc comment. */
export interface CompanyForMobileLogin {
  id: string;
  name: string;
  status: CompanyStatus;
  mobileConfig: {
    geoFencing: boolean;
    wifiValidation: boolean;
    selfieMandatory: boolean;
    mockGpsDetection: boolean;
    developerOptions: boolean;
    defaultGeoRadius: number;
    offlineAttendanceAllowed: boolean;
  };
}

/**
 * Relations/aggregates included on every company read, so a single company
 * row (or a page of them) carries everything toCompany() needs without any
 * extra per-row query:
 * - usm_users (filtered to is_admin='Y', take 1) — the admin whose
 *   email/name back-fill Company.email/contactPerson.
 * - integration_master (take 1) — any integration row, to derive
 *   integrationStatus the same way the old per-row findFirst() did.
 * - _count.usm_users — total employee headcount for the company.
 *
 * activeEmployeeCount (NOT account_locked) is deliberately NOT part of this
 * include: Prisma's relation _count doesn't support a `where` filter here
 * without an unstable/preview feature, so it's fetched via one additional
 * batched query (see activeEmployeeCountsByCompany) covering every company
 * in the current page/lookup at once — never per row.
 */
const COMPANY_INCLUDE = {
  usm_users: { where: { is_admin: ADMIN_FLAG_VALUE }, take: 1 },
  integration_master: { take: 1 },
  _count: { select: { usm_users: true } },
};

type CompanyRow = Prisma.usm_companyGetPayload<{
  include: {
    usm_users: true;
    integration_master: true;
    _count: { select: { usm_users: true } };
  };
}>;

/**
 * PrismaCompaniesRepository — reads/writes the real `usm_company` table.
 * Replaces InMemoryCompaniesRepository for this module only (see
 * companies.module.ts); CompaniesService's method signatures are
 * unchanged apart from now being async, since real I/O is.
 *
 * findAll() paginates at the database level (skip/take + a separate
 * count()) — see the Prisma repository audit report and the pagination
 * fixes it prompted. Every list/read here also derives the admin/employee-
 * count/integration-status fields via a single included query (plus one
 * batched active-count query) instead of the old per-row 4-query fan-out.
 *
 * Known compatibility gaps versus the old in-memory model (see the Phase 4
 * database report for full detail):
 * - usm_company has no email/contact-person column. Both are derived from
 *   that company's admin user in usm_users (is_admin = 'Y'). usm_users is
 *   currently empty, so these read back as '' until real admin users
 *   exist; create()/update() accept the fields (validation still applies)
 *   but do not persist them anywhere.
 * - employeeCount/activeEmployeeCount/integrationStatus aren't stored
 *   anywhere on usm_company; computed live from usm_users/integration_master
 *   on every read.
 *
 * Company Admin self-service methods (findSettingsByCompanyId/
 * updateSettings, at the bottom) are separate from the Super-Admin methods
 * above on purpose — see interfaces/company-settings.interface.ts's doc
 * comment. They touch only plain `usm_company` scalar columns, with no
 * include/aggregate and no Super-Admin-only validation.
 */
@Injectable()
export class PrismaCompaniesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Database-level pagination: PostgreSQL itself only returns the
   * requested page (skip/take), and `total` comes from a separate count()
   * — not from loading every row and measuring the array. Previously this
   * fetched every company via findMany() with no skip/take at all and let
   * the service slice the in-memory array.
   */
  async findAll(params: { skip: number; take: number }): Promise<{ companies: Company[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usm_company.findMany({
        orderBy: { id: 'asc' },
        skip: params.skip,
        take: params.take,
        include: COMPANY_INCLUDE,
      }),
      this.prisma.usm_company.count(),
    ]);

    const activeCounts = await this.activeEmployeeCountsByCompany(rows.map((row) => row.id));
    const companies = rows.map((row) => this.toCompany(row, activeCounts.get(row.id) ?? 0));

    return { companies, total };
  }

  async findById(id: string): Promise<Company | undefined> {
    const row = await this.prisma.usm_company.findUnique({
      where: { id },
      include: COMPANY_INCLUDE,
    });
    if (!row) return undefined;

    const activeEmployeeCount = await this.prisma.usm_users.count({
      where: { company_id: id, NOT: { account_locked: LOCKED_FLAG_VALUE } },
    });
    return this.toCompany(row, activeEmployeeCount);
  }

  /**
   * Duplicate-email check used by CompaniesService.create(). Since email
   * isn't stored on usm_company, this matches against an admin user's
   * email_address instead — which, with usm_users currently empty, means
   * it will never find a match right now. Documented, not a bug.
   *
   * Deliberately NOT scoped by company_id — this is a cross-company lookup
   * by design (a brand-new company can't be scoped by its own id yet). See
   * the Prisma repository audit report, section F, for the partial/
   * expression index (scripts/add-companies-admin-email-index.ts) that
   * supports exactly this query shape (is_admin = 'Y' + case-insensitive
   * email_address) as usm_users grows.
   */
  async findByEmail(email: string): Promise<Company | undefined> {
    const admin = await this.prisma.usm_users.findFirst({
      where: { is_admin: ADMIN_FLAG_VALUE, email_address: { equals: email.trim(), mode: 'insensitive' } },
    });
    return admin ? this.findById(admin.company_id) : undefined;
  }

  async create(dto: CreateCompanyDto): Promise<Company> {
    const now = new Date();
    let created: usm_company;
    try {
      created = await this.prisma.usm_company.create({
        data: {
          id: dto.id,
          title: dto.name,
          shortname: dto.shortname,
          phone: dto.phone,
          status: toStatusCode(dto.status),
          country: dto.country,
          add_date: now,
          edit_date: now,
        },
      });
    } catch (error) {
      this.handleWriteError(error);
    }

    // Re-read through findById() rather than hand-building the response:
    // a brand-new company always has 0 employees/no admin/no integration,
    // but going through the same derivation path findAll()/findById() use
    // keeps this in exactly one place instead of two.
    const company = await this.findById(created.id);
    if (!company) {
      // Not expected — the row was just created successfully above.
      throw new NotFoundException('Company not found immediately after creation.');
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company | undefined> {
    try {
      await this.prisma.usm_company.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { title: dto.name }),
          ...(dto.shortname !== undefined && { shortname: dto.shortname }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.status !== undefined && { status: toStatusCode(dto.status) }),
          ...(dto.country !== undefined && { country: dto.country }),
          edit_date: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // Matches InMemoryCompaniesRepository's contract: not found -> undefined,
        // letting CompaniesService throw its own NotFoundException.
        return undefined;
      }
      this.handleWriteError(error);
    }

    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.prisma.usm_company.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      this.handleWriteError(error);
    }
  }

  /**
   * Company Admin self-service read — backs GET /companies/mine. Plain
   * findUnique with no include: this view has no employee counts,
   * integration status, or admin-derived fields, so none of the
   * COMPANY_INCLUDE machinery above is needed.
   */
  async findSettingsByCompanyId(companyId: string): Promise<CompanySettings | undefined> {
    const row = await this.prisma.usm_company.findUnique({ where: { id: companyId } });
    if (!row) return undefined;
    return this.toCompanySettings(row);
  }

  /**
   * Company Admin self-service write — backs PATCH /companies/mine. Same
   * partial-update-by-presence pattern as update() above, but against a
   * disjoint set of columns (profile fields only) and a separate DTO with
   * no Super-Admin-only validation.
   */
  async updateSettings(companyId: string, dto: UpdateCompanySettingsDto): Promise<CompanySettings | undefined> {
    try {
      await this.prisma.usm_company.update({
        where: { id: companyId },
        data: {
          ...(dto.companyName !== undefined && { title: dto.companyName }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.fax !== undefined && { fax: dto.fax }),
          ...(dto.website !== undefined && { website: dto.website }),
          ...(dto.gstNumber !== undefined && { GST_: dto.gstNumber }),
          ...(dto.ntnNumber !== undefined && { NTN_: dto.ntnNumber }),
          edit_date: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined;
      }
      this.handleWriteError(error);
    }

    return this.findSettingsByCompanyId(companyId);
  }

  /**
   * Mobile Login addition — backs MobileAuthService, the only caller that
   * needs to resolve a company from `usm_company.shortname` rather than an
   * already-known id (there is no session yet on this route: see
   * MobileLoginDto's doc comment). Deliberately its own lean query, not a
   * detour through findById()/toCompany(): this needs none of the Super
   * Admin aggregate fields (employee counts, admin-derived email, etc.),
   * just enough to authenticate and to hand the mobile app its config.
   *
   * The mobile-config cluster returned here (geo_fencing/wifi_validation/
   * etc.) is real but was, until now, left entirely unexposed anywhere in
   * this API — see CompanySettings's own doc comment ("out of scope for
   * this pass; left for a future Settings section"). It's surfaced here,
   * and only here, because a mobile login is the one place the app actually
   * needs it to configure its own attendance-capture behavior.
   */
  async findForMobileLoginByShortname(shortname: string): Promise<CompanyForMobileLogin | undefined> {
    const row = await this.prisma.usm_company.findUnique({
      where: { shortname },
      select: {
        id: true,
        title: true,
        status: true,
        geo_fencing: true,
        wifi_validation: true,
        selfie_mandatory: true,
        mock_gps_detection: true,
        developer_options: true,
        default_geo_radius: true,
        offline_attendance_allowed: true,
      },
    });
    if (!row) return undefined;

    const isYes = (value: string | null) => value === 'Y';

    return {
      id: row.id,
      name: row.title,
      status: fromStatusCode(row.status),
      mobileConfig: {
        geoFencing: isYes(row.geo_fencing),
        wifiValidation: isYes(row.wifi_validation),
        selfieMandatory: isYes(row.selfie_mandatory),
        mockGpsDetection: isYes(row.mock_gps_detection),
        developerOptions: isYes(row.developer_options),
        defaultGeoRadius: Number(row.default_geo_radius ?? 100),
        offlineAttendanceAllowed: isYes(row.offline_attendance_allowed),
      },
    };
  }

  /**
   * One batched query for every company id in the current page/lookup,
   * instead of one count() per company. Empty input short-circuits without
   * a query at all (e.g. an empty page).
   */
  private async activeEmployeeCountsByCompany(companyIds: string[]): Promise<Map<string, number>> {
    if (companyIds.length === 0) return new Map();

    const grouped = await this.prisma.usm_users.groupBy({
      by: ['company_id'],
      where: { company_id: { in: companyIds }, NOT: { account_locked: LOCKED_FLAG_VALUE } },
      _count: { _all: true },
    });

    return new Map(grouped.map((entry) => [entry.company_id, entry._count._all]));
  }

  private toCompany(row: CompanyRow, activeEmployeeCount: number): Company {
    const admin = row.usm_users[0];
    const integration = row.integration_master[0];

    return {
      id: row.id,
      name: row.title,
      email: admin?.email_address ?? '',
      contactPerson: admin?.user_name ?? '',
      phone: row.phone ?? '',
      status: fromStatusCode(row.status),
      employeeCount: row._count.usm_users,
      activeEmployeeCount,
      integrationStatus: integration ? (integration.status === 'Y' ? 'CONNECTED' : 'DISCONNECTED') : 'DISCONNECTED',
      createdAt: (row.add_date ?? row.edit_date ?? new Date()).toISOString(),
      lastActivityAt: (row.edit_date ?? row.add_date ?? new Date()).toISOString(),
      shortname: row.shortname,
      country: row.country,
    };
  }

  private toCompanySettings(row: usm_company): CompanySettings {
    return {
      companyId: row.id,
      companyName: row.title,
      address: row.address ?? '',
      phone: row.phone ?? '',
      fax: row.fax ?? '',
      website: row.website ?? '',
      gstNumber: row.GST_ ?? '',
      ntnNumber: row.NTN_ ?? '',
    };
  }

  /** Translates Postgres constraint violations into the app's clean {success:false,message} shape instead of leaking a raw Prisma error. */
  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target ?? 'field');
        throw new ConflictException(`A company with this ${target} already exists.`);
      }
      if (error.code === 'P2003') {
        throw new ConflictException(
          'Cannot delete this company while employees, integrations, or logs still reference it.',
        );
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Company not found.');
      }
    }
    throw error;
  }
}
