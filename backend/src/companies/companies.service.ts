import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaCompaniesRepository } from './repositories/prisma-companies.repository';
import { Company } from './interfaces/company.interface';
import { CompanySettings } from './interfaces/company-settings.interface';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySettingsDto } from './dto/update-company-settings.dto';

/**
 * Companies service — Super Admin only, global scope (no tenant filtering:
 * a company IS a tenant, there is nothing "above" it to scope by here).
 *
 * Backed by PrismaCompaniesRepository (real PostgreSQL) as of the Phase 4
 * database migration. Method signatures are unchanged from the
 * InMemoryCompaniesRepository era apart from now being async, since real
 * database I/O is — CompaniesController/DTOs/guards were not touched.
 *
 * findMySettings/updateMySettings (bottom) are the Company Admin
 * self-service counterparts — see interfaces/company-settings.interface.ts.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly repository: PrismaCompaniesRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /**
   * Pagination now happens in PostgreSQL (see PrismaCompaniesRepository.
   * findAll): this only converts page/limit into skip/take and assembles
   * the response — see paginate.ts, which explicitly calls out
   * SystemLogsService as the one remaining caller of the old in-memory
   * paginate() helper until this migration. The {items, meta} response
   * contract is unchanged.
   */
  async findAll(page: number, limit: number): Promise<PaginatedResult<Company>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { companies, total } = await this.repository.findAll({ skip, take });
    return paginatedResult(companies, safePage, safeLimit, total);
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.repository.findById(id);
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  async create(dto: CreateCompanyDto, actorName: string): Promise<Company> {
    if (await this.repository.findByEmail(dto.email)) {
      throw new ConflictException('A company with this email already exists.');
    }

    const company = await this.repository.create(dto);

    this.systemLogsService.record({
      user: actorName,
      action: 'COMPANY_CREATED',
      resource: 'Company',
      resourceId: company.id,
      description: `Created ${company.name}.`,
      metadata: { companyId: company.id, initialStatus: company.status },
    });

    return company;
  }

  async update(id: string, dto: UpdateCompanyDto, actorName: string): Promise<Company> {
    const updated = await this.repository.update(id, dto);
    if (!updated) {
      throw new NotFoundException('Company not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'COMPANY_UPDATED',
      resource: 'Company',
      resourceId: updated.id,
      description: `Updated ${updated.name}.`,
      metadata: { companyId: updated.id, changes: dto },
    });

    return updated;
  }

  async remove(id: string, actorName: string): Promise<void> {
    const company = await this.repository.findById(id);
    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    await this.repository.remove(id);

    this.systemLogsService.record({
      user: actorName,
      action: 'COMPANY_DELETED',
      resource: 'Company',
      resourceId: id,
      severity: 'WARNING',
      description: `Deleted ${company.name}.`,
      metadata: { companyId: id },
    });
  }

  /** Backs GET /companies/mine (Company Admin). */
  async findMySettings(companyId: string): Promise<CompanySettings> {
    const settings = await this.repository.findSettingsByCompanyId(companyId);
    if (!settings) {
      throw new NotFoundException('Company not found.');
    }
    return settings;
  }

  /** Backs PATCH /companies/mine (Company Admin). */
  async updateMySettings(companyId: string, dto: UpdateCompanySettingsDto, actorName: string): Promise<CompanySettings> {
    const updated = await this.repository.updateSettings(companyId, dto);
    if (!updated) {
      throw new NotFoundException('Company not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'COMPANY_SETTINGS_UPDATED',
      resource: 'Company',
      resourceId: companyId,
      description: `Updated settings for ${updated.companyName}.`,
      metadata: { companyId, changes: dto },
    });

    return updated;
  }
}
