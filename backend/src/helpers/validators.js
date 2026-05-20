const { z } = require('zod');

/**
 * Schema for a single manual task item.
 * Fields: { date: string, description: string }
 * Uses .strip() so unknown fields are silently dropped (prevents mass injection).
 */
const manualTaskSchema = z.object({
  date: z.string().min(1, 'date wajib diisi'),
  description: z.string().min(1, 'description wajib diisi'),
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
 * @param {Object} body
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSaveSettings(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Payload tidak valid.' };
  }

  const result = saveSettingsSchema.safeParse(body);

  if (!result.success) {
    const firstError = result.error.issues[0];
    // Prefix field name so callers can identify which field failed
    const fieldName = firstError.path.length ? firstError.path[0] : '';
    const prefix = fieldName ? `${fieldName}: ` : '';
    return { valid: false, error: `${prefix}${firstError.message}` };
  }

  return { valid: true };
}

/**
 * Normalizes phone numbers to a standard Indonesian format (628...).
 * - Converts input to string.
 * - Removes all non-numeric characters.
 * - Replaces a leading '0' with '62' (e.g., 0812 -> 62812).
 * - Preserves existing '62' prefix.
 *
 * @param {string|number} phone - The phone number to normalize.
 * @returns {string} Normalized numeric string or empty string if input is falsy.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  
  // Ensure we have a string and strip non-digits
  let clean = String(phone).replace(/\D/g, '');
  
  // Replace leading '0' with '62' if present
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  }
  
  return clean;
}

module.exports = { validateManualTasks, validateSaveSettings, normalizePhoneNumber, manualTaskSchema, saveSettingsSchema };
