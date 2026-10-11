import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Employee } from '../interfaces/employee.interface';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';

/**
 * InMemoryEmployeesRepository — superseded by PrismaEmployeesRepository
 * (see employees.module.ts, which no longer provides this class) and no
 * longer instantiated anywhere in the running application. Left on disk
 * for reference only, the same way InMemoryCompaniesRepository and
 * InMemoryIntegrationsRepository were left after their migrations.
 *
 * Seed data and create()/update() were updated to match the current
 * Employee / CreateEmployeeDto / UpdateEmployeeDto shapes purely so this
 * otherwise-dead file keeps compiling as part of `nest build` — it has no
 * effect on the real API, which is served entirely by
 * PrismaEmployeesRepository.
 */
@Injectable()
export class InMemoryEmployeesRepository {
  private employees: Employee[] = [
    { id: 'emp_001', name: 'John Carter', email: 'john.carter@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_002', name: 'Fatima Noor', email: 'fatima.noor@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_003', name: 'Ahmed Raza', email: 'ahmed.raza@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_004', name: 'Sara Malik', email: 'sara.malik@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_005', name: 'Usman Tariq', email: 'usman.tariq@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_006', name: 'Zara Sheikh', email: 'zara.sheikh@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_007', name: 'Hamza Iqbal', email: 'hamza.iqbal@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_008', name: 'Mahnoor Aslam', email: 'mahnoor.aslam@abc.test', phone: null, mobile: null, companyId: 'cmp_001', companyName: 'ABC Pvt Ltd', integrationId: null, externalEmployeeId: null },

    // Different company — must never appear for the ABC Pvt Ltd Company Admin.
    { id: 'emp_101', name: 'Nida Farooq', email: 'nida.farooq@xyz.test', phone: null, mobile: null, companyId: 'cmp_002', companyName: 'XYZ Ltd', integrationId: null, externalEmployeeId: null },
    { id: 'emp_102', name: 'Owais Anwar', email: 'owais.anwar@xyz.test', phone: null, mobile: null, companyId: 'cmp_002', companyName: 'XYZ Ltd', integrationId: null, externalEmployeeId: null },
  ];

  findAllByCompany(companyId: string): Employee[] {
    return this.employees.filter((employee) => employee.companyId === companyId);
  }

  /** Returns undefined for both "does not exist" and "belongs to another company" — callers can't tell the difference, which is the point. */
  findByIdInCompany(id: string, companyId: string): Employee | undefined {
    return this.employees.find((employee) => employee.id === id && employee.companyId === companyId);
  }

  findById(id: string): Employee | undefined {
    return this.employees.find((employee) => employee.id === id);
  }

  findByEmailInCompany(email: string, companyId: string): Employee | undefined {
    const normalized = email.trim().toLowerCase();
    return this.employees.find(
      (employee) => employee.email.toLowerCase() === normalized && employee.companyId === companyId,
    );
  }

  create(dto: CreateEmployeeDto, companyId: string, companyName: string): Employee {
    const employee: Employee = {
      id: `emp_${randomUUID().slice(0, 8)}`,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      mobile: dto.mobile ?? null,
      companyId,
      companyName,
      integrationId: dto.integrationId ?? null,
      externalEmployeeId: dto.externalEmployeeId ?? null,
    };
    this.employees.push(employee);
    return employee;
  }

  updateInCompany(id: string, companyId: string, dto: UpdateEmployeeDto): Employee | undefined {
    const employee = this.findByIdInCompany(id, companyId);
    if (!employee) return undefined;
    Object.assign(employee, dto);
    return employee;
  }

  removeInCompany(id: string, companyId: string): boolean {
    const employee = this.findByIdInCompany(id, companyId);
    if (!employee) return false;
    this.employees = this.employees.filter((entry) => entry.id !== id);
    return true;
  }
}
