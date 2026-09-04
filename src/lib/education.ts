import type { Education } from '@/lib/types';

export function normalizeEducationRecord(
  education: Partial<Education>,
): Education {
  return {
    ...education,
    school: education.school ?? '',
    degree: education.degree ?? '',
    field: education.field ?? '',
    date: education.date ?? '',
  };
}

export function normalizeEducationRecords(
  education: Partial<Education>[],
): Education[] {
  return education.map(normalizeEducationRecord);
}