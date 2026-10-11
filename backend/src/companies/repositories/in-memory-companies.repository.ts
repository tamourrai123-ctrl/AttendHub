import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Company } from '../interfaces/company.interface';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';

/**
 * InMemoryCompaniesRepository — temporary development storage.
 *
 * Seed data mirrors the frontend's src/mock/companies.ts so ids like
 * "cmp_001" line up exactly with the employees/attendance/leave mock data
 * that references them. Replaced by a Prisma/PostgreSQL repository in the
 * database phase; CompaniesService is written against this class's method
 * signatures only, so that swap shouldn't require touching the service.
 */
@Injectable()
export class InMemoryCompaniesRepository {
  private companies: Company[] = [
    { id: 'cmp_001', name: 'ABC Pvt Ltd', email: 'ops@abc.test', contactPerson: 'Bilal Ahmed', phone: '+92 300 1234567', status: 'ACTIVE', employeeCount: 8, activeEmployeeCount: 6, integrationStatus: 'CONNECTED', createdAt: '2025-02-14T09:00:00Z', lastActivityAt: '2026-09-11T10:52:00Z' },
    { id: 'cmp_002', name: 'XYZ Ltd', email: 'it@xyz.test', contactPerson: 'Fatima Noor', phone: '+92 300 2345678', status: 'ACTIVE', employeeCount: 2, activeEmployeeCount: 2, integrationStatus: 'ERROR', createdAt: '2024-11-02T09:00:00Z', lastActivityAt: '2026-09-11T10:33:00Z' },
    { id: 'cmp_003', name: 'DEF Industries', email: 'admin@defindustries.test', contactPerson: 'Ahmed Raza', phone: '+92 300 3456789', status: 'ACTIVE', employeeCount: 128, activeEmployeeCount: 120, integrationStatus: 'CONNECTED', createdAt: '2025-06-30T09:00:00Z', lastActivityAt: '2026-09-11T08:15:00Z' },
    { id: 'cmp_004', name: 'Nova Textiles', email: 'hr@novatextiles.test', contactPerson: 'Sara Malik', phone: '+92 300 4567890', status: 'INACTIVE', employeeCount: 340, activeEmployeeCount: 0, integrationStatus: 'TESTING', createdAt: '2026-01-10T09:00:00Z', lastActivityAt: '2026-09-05T14:20:00Z' },
    { id: 'cmp_005', name: 'Skyline Foods', email: 'contact@skylinefoods.test', contactPerson: 'Usman Tariq', phone: '+92 300 5678901', status: 'SUSPENDED', employeeCount: 89, activeEmployeeCount: 0, integrationStatus: 'DISCONNECTED', createdAt: '2023-09-21T09:00:00Z', lastActivityAt: '2026-08-02T11:00:00Z' },
  ];

  findAll(): Company[] {
    return this.companies;
  }

  findById(id: string): Company | undefined {
    return this.companies.find((company) => company.id === id);
  }

  findByEmail(email: string): Company | undefined {
    const normalized = email.trim().toLowerCase();
    return this.companies.find((company) => company.email.toLowerCase() === normalized);
  }

  create(dto: CreateCompanyDto): Company {
    const now = new Date().toISOString();
    const company: Company = {
      id: `cmp_${randomUUID().slice(0, 8)}`,
      name: dto.name,
      email: dto.email,
      contactPerson: dto.contactPerson,
      phone: dto.phone,
      status: dto.status,
      employeeCount: 0,
      activeEmployeeCount: 0,
      integrationStatus: 'DISCONNECTED',
      createdAt: now,
      lastActivityAt: now,
    };
    this.companies.push(company);
    return company;
  }

  update(id: string, dto: UpdateCompanyDto): Company | undefined {
    const company = this.findById(id);
    if (!company) return undefined;
    Object.assign(company, dto, { lastActivityAt: new Date().toISOString() });
    return company;
  }

  remove(id: string): boolean {
    const lengthBefore = this.companies.length;
    this.companies = this.companies.filter((company) => company.id !== id);
    return this.companies.length < lengthBefore;
  }
}
