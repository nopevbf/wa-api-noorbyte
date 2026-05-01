const { z } = require('zod');

/**
 * Schema for a single manual task item.
 * Uses .strip() so unknown fields are silently dropped (prevents mass injection).
 */
const manualTaskSchema = z.object({
  task_name: z.string().min(1, 'task_name wajib diisi'),
  task_time: z.string().min(1, 'task_time wajib diisi'),
}).strip();

/**
 * Schema for the save-settings body fields that carry mass-assignment risk.
 * Validates is_active and frequency to prevent garbage data entering the DB.
 */
const saveSettingsSchema = z.object({
  is_active: z.boolean({ 
    invalid_type_error: 'is_active harus berupa boolean (true/false).' 
  }).optional(),
  frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
}).strip();

/**
 * Validates the manual_tasks field from a request body.
 * - If undefined/null, returns { valid: true, data: [] }
 * - If not an array, returns { valid: false, error: '...' }
 * - If items fail schema, returns { valid: false, error: '...' }
 * - Unknown fields on items are stripped from output.
 *
 * @param {*} manualTasks
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
      error: `manual_tasks tidak valid: ${firstError.path.join('.')} - ${firstError.message}`,
    };
  }

  return { valid: true, data: result.data };
}

/**
 * Validates mass-assignment-risky fields in the save-settings payload.
 * Only validates fields that have a narrow allowed range (is_active, frequency).
 *
 * @param {{ is_active?: any, frequency?: any }} body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSaveSettings(body) {
  const result = saveSettingsSchema.safeParse({
    is_active: body.is_active,
    frequency: body.frequency,
  });

  if (!result.success) {
    const firstError = result.error.issues[0];
    // Prefix field name so callers can identify which field failed
    const fieldName = firstError.path.length ? firstError.path[0] : '';
    const prefix = fieldName ? `${fieldName}: ` : '';
    return { valid: false, error: `${prefix}${firstError.message}` };
  }

  return { valid: true };
}

module.exports = { validateManualTasks, validateSaveSettings, manualTaskSchema, saveSettingsSchema };
