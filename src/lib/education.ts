import type { Education } from '@/lib/types';

export function normalizeEducationRecord(
  education: Partial<Education> & Pick<Education, 'school' | 'degree' | 'date'>,
): Education {
  return {
    ...education,
    field: education.field ?? '',
  };
}

export function normalizeEducationRecords(
  education: Array<Partial<Education> & Pick<Education, 'school' | 'degree' | 'date'>>,
): Education[] {
  return education.map(normalizeEducationRecord);
}