import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnvironmentFiles(currentWorkingDirectory = process.cwd()) {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(currentWorkingDirectory, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const variableName = trimmedLine.slice(0, separatorIndex).trim();
      let variableValue = trimmedLine.slice(separatorIndex + 1).trim();
      if (
        (variableValue.startsWith('"') && variableValue.endsWith('"')) ||
        (variableValue.startsWith("'") && variableValue.endsWith("'"))
      ) {
        variableValue = variableValue.slice(1, -1);
      }

      if (!process.env[variableName]) {
        process.env[variableName] = variableValue;
      }
    }

    return fileName;
  }

  return null;
}

export function getMissingEnvironmentVariables(requiredVariableNames) {
  return requiredVariableNames.filter((variableName) => !process.env[variableName]);
}
