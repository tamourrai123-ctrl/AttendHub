import { FieldMappingService } from './field-mapping.service';
import { FieldMapping } from '../interfaces/field-mapping.interface';

describe('FieldMappingService.applyToResponse — Oracle ORDS { items: [...] } bodies', () => {
  const service = new FieldMappingService();
  const mappings: FieldMapping[] = [
    { sourcePath: 'companyid', targetField: 'companyId', transform: 'NONE' },
    { sourcePath: 'companyname', targetField: 'title', transform: 'NONE' },
    { sourcePath: 'companyshortname', targetField: 'shortName', transform: 'NONE' },
  ];
  const ordsBody = {
    items: [{ companyid: 5, companyname: 'Ovacsol Pvt Ltd', companyshortname: 'OVACSOL' }],
    first: { $ref: 'https://example.test/get_companies/OVACSOL' },
  };

  it('maps plain field names found inside items[] rows (previously all null)', () => {
    expect(service.applyToResponse(ordsBody, mappings)).toEqual([{ companyId: 5, title: 'Ovacsol Pvt Ltd', shortName: 'OVACSOL' }]);
  });

  it('returns an empty list when items is empty (e.g. wrong login)', () => {
    expect(service.applyToResponse({ items: [] }, mappings)).toEqual([]);
  });

  it('still maps a bare object body exactly as before', () => {
    expect(service.applyToResponse({ companyid: 7, companyname: 'X', companyshortname: 'X1' }, mappings)).toEqual({ companyId: 7, title: 'X', shortName: 'X1' });
  });

  it('keeps top-level mapping when a mapped path exists at the top level even if items exists', () => {
    const m: FieldMapping[] = [{ sourcePath: 'count', targetField: 'total', transform: 'NONE' }];
    expect(service.applyToResponse({ count: 3, items: [{ a: 1 }] }, m)).toEqual({ total: 3 });
  });

  it('still honours explicit items[] paths', () => {
    const m: FieldMapping[] = [{ sourcePath: 'items[].companyid', targetField: 'companyId', transform: 'NONE' }];
    expect(service.applyToResponse(ordsBody, m)).toEqual([{ companyId: 5 }]);
  });
});
