import type { Result } from 'axe-core';

export type ImpactLevel = 'minor' | 'moderate' | 'serious' | 'critical';

export type WcagLevel = 'wcag2a' | 'wcag2aa' | 'wcag21aa' | 'wcag22aa';

export interface ActionInputs {
  urls: string[];
  wcagLevel: WcagLevel;
  impactThreshold: ImpactLevel;
  failOnViolation: boolean;
  comment: boolean;
  token: string;
}

export interface PageResult {
  url: string;
  violations: Result[];
  passes: Result[];
  incomplete: Result[];
  inapplicable: Result[];
}

export interface AuditResult {
  pages: PageResult[];
  totalViolations: number;
  totalPasses: number;
}
