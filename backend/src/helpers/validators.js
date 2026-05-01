const { z } = require('zod');

/**
 * Schema for a single manual task item.
 * Each task must have a task_name (string) and task_time (string).
 */
const manualTaskSchema = z.object({
  task_name: z.string().min(1, 'task_name wajib diisi'),
  task_time: z.string().min(1, 'task_time wajib diisi'),
}).passthrough(); // allow additional fields

/**
 * Validates the manual_tasks field from a request body.
 * - If undefined, returns { valid: true, data: [] }
 * - If not an array, returns { valid: false, error: '...' }
 * - If array items don't match schema, returns { valid: false, error: '...' }
 * 
 * @param {*} manualTasks - The manual_tasks value from req.body
 * @returns {{ valid: boolean, data?: Array, error?: string }}
 */
function validateManualTasks(manualTasks) {
  if (manualTasks === undefined || manualTasks === null) {
    return { valid: true, data: [] };
  }

  if (!Array.isArray(manualTasks)) {
    return { valid: false, error: 'manual_tasks harus berupa array.' };
  }

  if (manualTasks.length === 0) {
    return { valid: true, data: [] };
  }

  const result = z.array(manualTaskSchema).safeParse(manualTasks);

  if (!result.success) {
    const firstError = result.error.issues[0];
    return { 
      valid: false, 
      error: `manual_tasks tidak valid: ${firstError.path.join('.')} - ${firstError.message}` 
    };
  }

  return { valid: true, data: result.data };
}

module.exports = { validateManualTasks, manualTaskSchema };
