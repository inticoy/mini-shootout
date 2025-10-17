import { defineConfig } from 'vite';

const repoName = 'mini-shootout';

export default defineConfig(() => {
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const envBase = process.env.VITE_BASE_PATH;

  return {
    base: envBase ?? (isGithubActions ? `/${repoName}/` : '/')
  };
});
