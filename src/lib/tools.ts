import { tool as createTool } from 'ai';
import { z } from 'zod';
import { Resume } from '@/lib/types';
import { updateResume } from '@/utils/actions/resumes/actions';

export const getResumeTool = createTool({
  description: 'Get the user Resume. Can request specific sections or "all" for the entire resume.',
  parameters: z.object({
    sections: z.union([
      z.string(),
      z.array(z.enum([
        'all',
        'personal_info',
        'work_experience',
        'education',
        'skills',
        'projects',
      ]))
    ]).optional().default('all').transform(val => Array.isArray(val) ? val : [val]),
  }),
});

export const suggestWorkExperienceTool = createTool({
  description: 'Suggest improvements for a specific work experience entry',
  parameters: z.object({
    index: z.number().describe('Index of the work experience entry to improve'),
    improved_experience: z.object({
      date: z.string(),
      company: z.string(),
      location: z.string().optional(),
      position: z.string(),
      description: z.array(z.string()),
      technologies: z.array(z.string()).optional(),
    }).describe('Improved version of the work experience entry. For important keywords, format them as bold, like this: **keyword**. Put two asterisks around the keyword or phrase.'),
  }),
});

export const suggestProjectTool = createTool({
  description: 'Suggest improvements for a specific project entry',
  parameters: z.object({
    index: z.number().describe('Index of the project entry to improve'),
    improved_project: z.object({
      name: z.string(),
      description: z.array(z.string()),
      date: z.string().optional(),
      technologies: z.array(z.string()).optional(),
      url: z.string().optional(),
      github_url: z.string().optional(),
    }).describe('Improved version of the project entry. For important keywords, format them as bold, like this: **keyword**. Put two asterisks around the keyword or phrase.'),
  }),
});

export const suggestSkillTool = createTool({
  description: 'Suggest improvements for a specific skill category. Never use this for an explicit request to add, remove, or change skills; use modifyWholeResume instead.',
  parameters: z.object({
    index: z.number().describe('Index of the skill category to improve'),
    improved_skill: z.object({
      category: z.string(),
      items: z.array(z.string()),
    }).describe('Improved version of the skill category. ONLY use this tool to add NEW skills or REMOVE existing skills, DO NOT ADD IN EXISTING SKILLS IN ANY WAY.'),
  }),
});

export const suggestEducationTool = createTool({
  description: 'Suggest improvements for a specific education entry',
  parameters: z.object({
    index: z.number().describe('Index of the education entry to improve'),
    improved_education: z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      location: z.string().optional(),
      date: z.string(),
      gpa: z.string().optional(),
      achievements: z.array(z.string()).optional(),
    }).describe('Improved version of the education entry. For important keywords, format them as bold, like this: **keyword**. Put two asterisks around the keyword or phrase.'),
  }),
});

export const modifyWholeResumeTool = createTool({
  description: 'Apply an explicit user-requested resume change immediately and persist it. Use this for any request to add, remove, or change resume content, including skills. For important keywords, format them as bold, like this: **keyword**.',
  parameters: z.object({
    basic_info: z.object({
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      email: z.string().optional(),
      phone_number: z.string().optional(),
      location: z.string().optional(),
      website: z.string().optional(),
      linkedin_url: z.string().optional(),
      github_url: z.string().optional(),
    }).optional(),
    work_experience: z.array(z.object({
      company: z.string(),
      position: z.string(),
      location: z.string().optional(),
      date: z.string(),
      description: z.array(z.string()),
      technologies: z.array(z.string()).optional(),
    })).optional(),
    education: z.array(z.object({
      school: z.string(),
      degree: z.string(),
      field: z.string(),
      location: z.string().optional(),
      date: z.string(),
      gpa: z.string().optional(),
      achievements: z.array(z.string()).optional(),
    })).optional(),
    skills: z.array(z.object({
      category: z.string(),
      items: z.array(z.string()),
    })).optional(),
    projects: z.array(z.object({
      name: z.string(),
      description: z.array(z.string()),
      date: z.string().optional(),
      technologies: z.array(z.string()).optional(),
      url: z.string().optional(),
      github_url: z.string().optional(),
    })).optional(),
  }),
});



  

// Export all tools in a single object for convenience
export const tools = {
  getResume: getResumeTool,
  read_resume: getResumeTool,
  suggest_work_experience_improvement: suggestWorkExperienceTool,
  suggest_project_improvement: suggestProjectTool,
  suggest_skill_improvement: suggestSkillTool,
  suggest_education_improvement: suggestEducationTool,
  modifyWholeResume: modifyWholeResumeTool,

}; 

export function createChatTools(resume: Resume) {
  const readResume = async ({ sections }: { sections: string[] }) => {
    const personalInfo = {
      first_name: resume.first_name,
      last_name: resume.last_name,
      email: resume.email,
      phone_number: resume.phone_number,
      location: resume.location,
      website: resume.website,
      linkedin_url: resume.linkedin_url,
      github_url: resume.github_url,
    };
    const sectionMap = {
      personal_info: personalInfo,
      work_experience: resume.work_experience,
      education: resume.education,
      skills: resume.skills,
      projects: resume.projects,
    };

    if (sections.includes('all')) {
      return { ...sectionMap, target_role: resume.target_role };
    }

    return sections.reduce<Record<string, unknown>>((result, section) => {
      result[section] = sectionMap[section as keyof typeof sectionMap];
      return result;
    }, {});
  };

  return {
    ...tools,
    getResume: createTool({
      description: getResumeTool.description,
      parameters: getResumeTool.parameters,
      execute: async (input) => {
        console.info('[AI][TOOL]', { tool: 'getResume', phase: 'execute' });
        return readResume(input);
      },
    }),
    read_resume: createTool({
      description: getResumeTool.description,
      parameters: getResumeTool.parameters,
      execute: async (input) => {
        console.info('[AI][TOOL]', { tool: 'read_resume', phase: 'execute' });
        return readResume(input);
      },
    }),
    suggest_work_experience_improvement: createTool({
      description: suggestWorkExperienceTool.description,
      parameters: suggestWorkExperienceTool.parameters,
      execute: async (input) => input,
    }),
    suggest_project_improvement: createTool({
      description: suggestProjectTool.description,
      parameters: suggestProjectTool.parameters,
      execute: async (input) => input,
    }),
    suggest_skill_improvement: createTool({
      description: suggestSkillTool.description,
      parameters: suggestSkillTool.parameters,
      execute: async (input) => input,
    }),
    suggest_education_improvement: createTool({
      description: suggestEducationTool.description,
      parameters: suggestEducationTool.parameters,
      execute: async (input) => input,
    }),
    modifyWholeResume: createTool({
      description: modifyWholeResumeTool.description,
      parameters: modifyWholeResumeTool.parameters,
      execute: async (updates) => {
        console.info('[AI][TOOL]', { tool: 'modifyWholeResume', phase: 'execute' });
        const persistedUpdates: Partial<Resume> = {
          ...(updates.basic_info ?? {}),
          ...(updates.work_experience ? { work_experience: updates.work_experience } : {}),
          ...(updates.education ? { education: updates.education } : {}),
          ...(updates.skills ? { skills: updates.skills } : {}),
          ...(updates.projects ? { projects: updates.projects } : {}),
        };
        await updateResume(resume.id, persistedUpdates);
        console.info('[AI][DB]', { operation: 'updateResume', success: true });
        return { success: true };
      },
    }),
  };
}