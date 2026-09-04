import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { modifyWholeResumeParameters } from '@/lib/tools';
import { normalizeEducationRecords } from '@/lib/education';

const educationWithoutField = {
  date: 'October 2021 - May 2025',
  degree: 'B.Tech Computer Science Engineering',
  school: 'Anurag Engineering College',
  location: 'Hyderabad, Telangana, IND',
};

describe('modifyWholeResume education arguments', () => {
  it('accepts education without field and supplies a safe default', () => {
    const result = modifyWholeResumeParameters.parse({ education: [educationWithoutField] });
    assert.equal(result.education?.[0].field, '');
  });

  it('accepts education with field', () => {
    const result = modifyWholeResumeParameters.parse({
      education: [{ ...educationWithoutField, field: 'Computer Science Engineering' }],
    });
    assert.equal(result.education?.[0].field, 'Computer Science Engineering');
  });

  it('accepts multiple education records', () => {
    const result = modifyWholeResumeParameters.parse({
      education: [educationWithoutField, { ...educationWithoutField, school: 'Another University' }],
    });
    assert.equal(result.education?.length, 2);
  });

  it('continues validating projects, skills, and basic info', () => {
    assert.doesNotThrow(() => modifyWholeResumeParameters.parse({
      basic_info: { first_name: 'Ada' },
      skills: [{ category: 'Languages', items: ['TypeScript'] }],
      projects: [{ name: 'ResumeLM', description: ['Built an AI resume editor'] }],
    }));
  });

  it('rejects malformed optional arrays without throwing outside validation', () => {
    const result = modifyWholeResumeParameters.safeParse({
      education: [{ ...educationWithoutField, achievements: ['ok', 42] }],
    });
    assert.equal(result.success, false);
  });
});

describe('education normalization', () => {
  it('normalizes records before persistence', () => {
    const normalized = normalizeEducationRecords([educationWithoutField]);
    assert.deepEqual(normalized[0], { ...educationWithoutField, field: '' });
  });

  it('fills missing canonical education strings without inventing content', () => {
    assert.deepEqual(normalizeEducationRecords([{}])[0], {
      school: '',
      degree: '',
      field: '',
      date: '',
    });
  });
});