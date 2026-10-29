export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
}

const required = (key: string, errors: string[]) => {
  if (!process.env[key] || process.env[key]!.trim() === '') {
    errors.push(`${key} is required`);
  }
};

export const validateEnv = (): EnvValidationResult => {
  const errors: string[] = [];

  required('JWT_SECRET', errors);
  required('DB_HOST', errors);
  required('DB_USER', errors);
  required('DB_PASSWORD', errors);
  required('DB_NAME', errors);

  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET ?? '';
    if (secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
  }

  return { valid: errors.length === 0, errors };
};
