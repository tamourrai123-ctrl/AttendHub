import { BadRequestException, ConflictException } from '@nestjs/common';
import { GlobalEndpointsService, methodFitsDirection } from './global-endpoints.service';
import { GlobalEndpoint } from './interfaces/global-endpoint.interface';

const stored = (over: Partial<GlobalEndpoint> = {}): GlobalEndpoint => ({
  id: '1',
  name: 'DAILY_REPORT',
  label: 'Daily report',
  description: null,
  direction: 'INBOUND',
  defaultHttpMethod: 'GET',
  fields: [],
  callableBy: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('GlobalEndpointsService', () => {
  const build = (existing?: GlobalEndpoint) => {
    const repo = {
      findByName: jest.fn().mockResolvedValue(existing),
      findById: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(async (input) => stored(input)),
      update: jest.fn().mockImplementation(async (_id, input) => stored({ ...existing, ...input })),
      remove: jest.fn().mockResolvedValue(true),
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const logs = { record: jest.fn() };
    return { service: new GlobalEndpointsService(repo as never, logs as never), repo };
  };

  it('methods must fit the direction', () => {
    expect(methodFitsDirection('INBOUND', 'GET')).toBe(true);
    expect(methodFitsDirection('INBOUND', 'POST')).toBe(false);
    expect(methodFitsDirection('OUTBOUND', 'POST')).toBe(true);
    expect(methodFitsDirection('OUTBOUND', 'GET')).toBe(false);
  });

  it('creates with the direction default method and trimmed, de-duplicated fields', async () => {
    const { service, repo } = build();
    await service.create(
      { name: 'PUSH_ORDERS', label: ' Push orders ', direction: 'OUTBOUND', fields: [{ field: 'a', label: 'A' }, { field: ' a ', label: 'dup' }] },
      'root',
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PUSH_ORDERS', label: 'Push orders', defaultHttpMethod: 'POST', callableBy: 'ADMIN', fields: [{ field: 'a', label: 'A' }] }),
    );
  });

  it('refuses built-in names', async () => {
    const { service } = build();
    await expect(service.create({ name: 'LOGIN_SESSION', label: 'x', direction: 'OUTBOUND' }, 'root')).rejects.toThrow(BadRequestException);
    await expect(service.create({ name: 'EMPLOYEES', label: 'x', direction: 'INBOUND' }, 'root')).rejects.toThrow(BadRequestException);
  });

  it('refuses a duplicate name', async () => {
    const { service } = build(stored());
    await expect(service.create({ name: 'DAILY_REPORT', label: 'x', direction: 'INBOUND' }, 'root')).rejects.toThrow(ConflictException);
  });

  it('refuses a method that does not fit the direction', async () => {
    const { service } = build();
    await expect(service.create({ name: 'BAD_ONE', label: 'x', direction: 'INBOUND', defaultHttpMethod: 'POST' }, 'root')).rejects.toThrow(BadRequestException);
  });

  it('refuses to create without at least one field', async () => {
    const { service } = build();
    await expect(service.create({ name: 'NO_FIELDS', label: 'x', direction: 'INBOUND' }, 'root')).rejects.toThrow(BadRequestException);
    await expect(service.create({ name: 'NO_FIELDS', label: 'x', direction: 'INBOUND', fields: [{ field: ' ', label: '' }] }, 'root')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses to save an empty field list but allows updates that do not send fields', async () => {
    const { service, repo } = build(stored());
    await expect(service.update('1', { fields: [] }, 'root')).rejects.toThrow(BadRequestException);
    await service.update('1', { status: 'INACTIVE' }, 'root');
    expect(repo.update).toHaveBeenCalledWith('1', expect.objectContaining({ status: 'INACTIVE', fields: undefined }));
  });

  it('switching direction resets the method to that direction default', async () => {
    const { service, repo } = build(stored());
    await service.update('1', { direction: 'OUTBOUND' }, 'root');
    expect(repo.update).toHaveBeenCalledWith('1', expect.objectContaining({ direction: 'OUTBOUND', defaultHttpMethod: 'POST' }));
  });
});
