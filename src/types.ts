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
  baselinePath: string;
  crawl: boolean;
  maxPages: number;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  aiPromptFile: string;
}

export interface AiSuggestion {
  ruleId: string;
  fix: string;
}

export type AiSuggestionsMap = Map<string, Map<string, string>>;

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

export interface BaselineEntry {
  ruleId: string;
  selector: string;
  impact: string;
}

export interface BaselineFile {
  version: 1;
  createdAt: string;
  entries: BaselineEntry[];
}

export interface BaselineResult {
  newViolations: number;
  baselineViolations: number;
  newPages: PageResult[];
}
