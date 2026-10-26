import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const build = () => {
    const findPage = jest.fn().mockResolvedValue({ payments: [], total: 0 });
    const create = jest.fn().mockResolvedValue(undefined);
    return { service: new PaymentsService({ findPage, create } as never), findPage, create };
  };

  it('a Company Admin only ever sees their own company', async () => {
    const { service, findPage } = build();
    await service.listForCompany('07', { page: 2, limit: 10 });
    expect(findPage).toHaveBeenCalledWith({ companyId: '07', status: undefined, skip: 10, take: 10 });
  });

  it('Super Admin can narrow to one company and a status', async () => {
    const { service, findPage } = build();
    const out = await service.listAll({ companyId: '05', status: 'PAID' });
    expect(findPage).toHaveBeenCalledWith({ companyId: '05', status: 'PAID', skip: 0, take: 20 });
    expect(out.meta).toEqual({ page: 1, limit: 20, total: 0 });
  });

  it('recordPayment passes the gateway data to the repository', async () => {
    const { service, create } = build();
    const input = { companyId: '05', amount: 29, currency: 'usd', status: 'PAID' as const };
    await service.recordPayment(input);
    expect(create).toHaveBeenCalledWith(input);
  });
});
