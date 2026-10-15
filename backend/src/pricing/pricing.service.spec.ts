import { BadRequestException, ConflictException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { CreatePlanDto } from './dto/create-plan.dto';

function dto(overrides: Partial<CreatePlanDto> = {}): CreatePlanDto {
  return {
    name: 'Basic',
    description: 'd',
    monthlyPrice: 1,
    yearlyPrice: 10,
    currency: 'USD',
    features: ['x'],
    recommended: false,
    active: true,
    ...overrides,
  } as CreatePlanDto;
}

function build(companiesOnPlan = 0) {
  const repository = {
    count: jest.fn(async () => 0),
    clearRecommended: jest.fn(async () => undefined),
    create: jest.fn(async () => ({ id: '1', name: 'Basic' })),
    update: jest.fn(async () => ({ id: '1', name: 'Basic' })),
    findById: jest.fn(async () => ({ id: '1', name: 'Basic' })),
    remove: jest.fn(async () => true),
    countCompaniesOnPlan: jest.fn(async () => companiesOnPlan),
  };
  const systemLogs = { record: jest.fn() };
  return { service: new PricingService(repository as never, systemLogs as never), repository };
}

describe('PricingService custom features and limits', () => {
  it('accepts a plan with maxUsers, trialDays and custom features', async () => {
    const { service, repository } = build();
    await service.create(
      dto({ maxUsers: 25, trialDays: 14, customFeatures: [{ key: 'prioritySupport', label: 'Priority support', value: true }, { key: 'storageGb', label: 'Storage', value: 50 }] }),
      'Admin',
    );
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate custom feature keys', async () => {
    const { service, repository } = build();
    await expect(
      service.create(dto({ customFeatures: [{ key: 'a', label: 'A', value: 1 }, { key: 'a', label: 'B', value: 2 }] }), 'Admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a custom feature value that is not a string, number or boolean', async () => {
    const { service } = build();
    await expect(
      service.update('1', { customFeatures: [{ key: 'a', label: 'A', value: { nested: true } as never }] }, 'Admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PricingService.remove', () => {
  it('refuses to delete a plan that companies are still on', async () => {
    const { service, repository } = build(3);
    await expect(service.remove('1', 'Admin')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('deletes an unused plan', async () => {
    const { service, repository } = build(0);
    await service.remove('1', 'Admin');
    expect(repository.remove).toHaveBeenCalledWith('1');
  });
});
