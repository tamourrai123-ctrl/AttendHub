import { Injectable } from '@nestjs/common';
import { Role } from '../../common/constants/roles.enum';

/**
 * A single mock, development-only login account. NEVER a stand-in for a
 * real user/password table — plaintext passwords here are acceptable only
 * because this whole repository is deleted the moment real authentication
 * (Phase 4B's "production authentication infrastructure", explicitly out of
 * scope) is built against a real database.
 */
export interface MockUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  companyId?: string;
  companyName?: string;
  employeeId?: string;
}

/**
 * InMemoryUsersRepository — temporary development storage.
 *
 * Mirrors the three demo accounts the frontend has used since Phase 1
 * (src/mock/users.ts) so the same credentials that already log into the
 * React app's mock auth also work against this real API.
 */
@Injectable()
export class InMemoryUsersRepository {
  private readonly users: MockUserRecord[] = [
    {
      id: 'usr_super_admin',
      name: 'Rai Tamour',
      email: 'admin@tamotam.test',
      password: 'admin123',
      role: Role.SUPER_ADMIN,
    },
    {
      id: 'usr_company_admin',
      name: 'Bilal Ahmed',
      email: 'company@tamotam.test',
      password: 'company123',
      role: Role.COMPANY_ADMIN,
      companyId: 'cmp_001',
      companyName: 'ABC Pvt Ltd',
    },
    {
      id: 'usr_employee',
      name: 'John Carter',
      email: 'employee@tamotam.test',
      password: 'employee123',
      role: Role.EMPLOYEE,
      companyId: 'cmp_001',
      companyName: 'ABC Pvt Ltd',
      employeeId: 'emp_001',
    },
  ];

  findByEmail(email: string): MockUserRecord | undefined {
    const normalized = email.trim().toLowerCase();
    return this.users.find((user) => user.email.toLowerCase() === normalized);
  }

  findById(userId: string): MockUserRecord | undefined {
    return this.users.find((user) => user.id === userId);
  }
}
