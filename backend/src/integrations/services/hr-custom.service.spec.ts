import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role } from '../../common/constants/roles.enum';
import { FieldMappingService } from './field-mapping.service';
import { HrCustomService } from './hr-custom.service';

describe('HrCustomService', () => {
  const endpoint = (over: Record<string, unknown> = {}) => ({
    id: 'e1', name: 'ceo-dashboard', status: 'ACTIVE', httpMethod: 'GET', callableBy: 'ADMIN',
    endpoint: '/ceo/:p_shortname/:p_date', description: null, ...over,
  });
  const build = (ep: ReturnType<typeof endpoint>) => {
    const execute = jest.fn().mockResolvedValue({ success: true, statusCode: 200, durationMs: 1, body: { a: 1 } });
    const service = new HrCustomService(
      { findMineForCompany: jest.fn().mockResolvedValue({ id: 'i1', status: 'CONNECTED' }) } as never,
      { findByIntegrationAndName: jest.fn().mockResolvedValue(ep) } as never,
      { findActiveByEndpoint: jest.fn().mockResolvedValue([]) } as never,
      new FieldMappingService(),
      { execute } as never,
      { findById: jest.fn().mockResolvedValue({ shortname: 'OVAC' }) } as never,
    );
    return { service, execute };
  };

  it('fills shortname and takes date from the query', async () => {
    const { service, execute } = build(endpoint());
    await service.call({ companyId: 'c1', role: Role.COMPANY_ADMIN }, 'ceo-dashboard', { date: '01-JAN-2026' }, 'GET');
    expect(execute).toHaveBeenCalledWith('c1', 'i1', 'e1', { date: '01-JAN-2026', shortname: 'OVAC' }, undefined, { allPages: true });
  });

  it('refuses employees unless callableBy is ALL', async () => {
    const { service } = build(endpoint());
    await expect(service.call({ companyId: 'c1', role: Role.EMPLOYEE }, 'ceo-dashboard', {}, 'GET')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses built-in names', async () => {
    const { service } = build(endpoint());
    await expect(service.call({ companyId: 'c1', role: Role.COMPANY_ADMIN }, 'WIFI_INFO', {}, 'GET')).rejects.toBeInstanceOf(BadRequestException);
  });
});
