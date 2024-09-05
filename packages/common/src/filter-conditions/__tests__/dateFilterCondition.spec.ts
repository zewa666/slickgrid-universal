import { describe, expect, it } from 'vitest';

import { FieldType } from '../../enums/index';
import type { FilterConditionOption } from '../../interfaces/index';
import { getFilterParsedDates } from '../dateFilterCondition';
import { executeFilterConditionTest } from '../filterConditionProcesses';

describe('dateFilterCondition method', () => {
  it('should return False when no cell value is provided, neither search terms', () => {
    const searchTerms = undefined;
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '' } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False when any cell value is provided without any search terms', () => {
    const searchTerms = undefined;
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '2000-12-25' } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False when search term is not a valid date', () => {
    const searchTerms = ['2000-14-25'];
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '2000-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return True when input value provided is equal to the searchTerms', () => {
    const searchTerms = ['1993-12-25'];
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(true);
  });

  it('should return False when cell value is not the same value as the searchTerm', () => {
    const searchTerms = ['2003-03-14'];
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False even when the cell value is found in the searchTerms since it only compares first term', () => {
    const searchTerms = ['2003-03-14', '1993-12-25'];
    const options = { dataKey: '', operator: 'EQ', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False even when Operator is Not Equal and cell value equals the search term', () => {
    const searchTerms = ['1993-12-25'];
    const options = { dataKey: '', operator: 'NE', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return True even when Operator is Not Equal and cell value is different than the search term', () => {
    const searchTerms = ['2002-12-25'];
    const options = { dataKey: '', operator: 'NE', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(true);
  });

  it('should return False when there are no search term and no operator', () => {
    const searchTerms = [null as any];
    const options = { dataKey: '', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False when search and cell values are different and there are no operator passed, it will use default EQ operator', () => {
    const searchTerms = ['1993-12-27'];
    const options = { dataKey: '', fieldType: FieldType.date, cellValue: '1993-12-25', searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return True when input value is in the range of search terms', () => {
    const searchTerms = ['1993-12-01..1993-12-31'];
    const options = { dataKey: '', operator: 'EQ', cellValue: '1993-12-25', fieldType: FieldType.date, searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(true);
  });

  it('should return False when input value is not in the range of search terms', () => {
    const searchTerms = ['1993-12-01..1993-12-31'];
    const options = { dataKey: '', operator: 'EQ', cellValue: '1993-11-25', fieldType: FieldType.date, searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return True when input value equals the search terms min inclusive value and operator is set to "rangeInclusive"', () => {
    const searchTerms = ['1993-12-01..1993-12-31'];
    const options = { dataKey: '', operator: 'RangeInclusive', cellValue: '1993-12-01', fieldType: FieldType.date, searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(true);
  });

  it('should return False when input value equals the search terms min inclusive value and operator is set to "RangeExclusive"', () => {
    const searchTerms = ['1993-12-01..1993-12-31'];
    const options = { dataKey: '', operator: 'RangeExclusive', cellValue: '1993-12-01', fieldType: FieldType.date, searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });

  it('should return False when any of the 2 search term value is not a valid date', () => {
    const searchTerms = ['1993-12-01..1993-12-60'];
    const options = { dataKey: '', operator: 'RangeExclusive', cellValue: '1993-12-05', fieldType: FieldType.date, searchTerms } as FilterConditionOption;
    const output = executeFilterConditionTest(options, getFilterParsedDates(searchTerms, FieldType.date));
    expect(output).toBe(false);
  });
});
