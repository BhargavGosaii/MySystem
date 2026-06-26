import * as fs from 'fs';
import * as path from 'path';

export interface ConfidenceRule {
  conditions: string[];       // e.g. ['hasWebsockets', 'queueLib']
  operator: 'AND' | 'OR';
  negated: boolean;           // true if the rule starts with NOT
  result: string;             // e.g. 'ecs-fargate', 'true', 'false'
  confidence: number;         // 0-100
}

export interface ParsedKnowledge {
  name: string;
  purpose: string;
  pros: string[];
  cons: string[];
  subTradeoffs?: Record<string, { pros: string[]; cons: string[] }>;
  complexity: 'Low' | 'Medium' | 'High';
  cost: number;
  confidenceRules: ConfidenceRule[];
}

/**
 * Parses a single confidence rule line.
 * Format: "- IF condition1 OR condition2 THEN result CONFIDENCE 95"
 * Format: "- IF NOT condition1 AND NOT condition2 THEN result CONFIDENCE 95"
 */
function parseConfidenceRuleLine(line: string): ConfidenceRule | null {
  // Strip leading "- " and trim
  const cleaned = line.replace(/^-\s*/, '').trim();

  // Match: IF <conditions> THEN <result> CONFIDENCE <number>
  const match = cleaned.match(/^IF\s+(.+?)\s+THEN\s+(\S+)\s+CONFIDENCE\s+(\d+)$/i);
  if (!match) return null;

  const conditionBlock = match[1].trim();
  const result = match[2].trim();
  const confidence = parseInt(match[3], 10);

  // Determine if the entire condition block is negated
  const negated = conditionBlock.toUpperCase().startsWith('NOT ');

  // Determine operator (OR takes precedence in detection)
  const hasOr = /\s+OR\s+/i.test(conditionBlock);
  const operator: 'AND' | 'OR' = hasOr ? 'OR' : 'AND';

  // Split by operator and clean each condition
  const splitRegex = hasOr ? /\s+OR\s+/i : /\s+AND\s+/i;
  const conditions = conditionBlock
    .split(splitRegex)
    .map(c => c.replace(/^NOT\s+/i, '').trim())
    .filter(c => c.length > 0);

  return { conditions, operator, negated, result, confidence };
}

export function parseKnowledgeFile(filePath: string): ParsedKnowledge {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Knowledge file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let name = path.basename(filePath, '.md');
  let purpose = '';
  const pros: string[] = [];
  const cons: string[] = [];
  const subTradeoffs: Record<string, { pros: string[]; cons: string[] }> = {};
  let complexity: 'Low' | 'Medium' | 'High' = 'Low';
  let cost = 0;
  const confidenceRules: ConfidenceRule[] = [];
  
  let currentSection = '';
  let currentSubheading = '';
  let inPros = false;
  let inCons = false;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('# ')) {
      name = line.replace('# ', '');
      continue;
    }
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').toLowerCase();
      inPros = false;
      inCons = false;
      currentSubheading = '';
      continue;
    }
    if (line.startsWith('### ')) {
      currentSubheading = line.replace('### ', '').trim().toLowerCase();
      inPros = false;
      inCons = false;
      continue;
    }

    if (currentSection === 'purpose') {
      if (line && !line.startsWith('##')) purpose += (purpose ? ' ' : '') + line;
    } else if (currentSection === 'trade-offs') {
      if (line.toLowerCase().includes('pros')) {
        inPros = true;
        inCons = false;
        continue;
      }
      if (line.toLowerCase().includes('cons')) {
        inPros = false;
        inCons = true;
        continue;
      }
      if (line.startsWith('- ')) {
        const cleanLine = line.replace('- ', '').replace(/\*\*/g, '');
        if (currentSubheading) {
          if (!subTradeoffs[currentSubheading]) {
            subTradeoffs[currentSubheading] = { pros: [], cons: [] };
          }
          if (inPros) {
            subTradeoffs[currentSubheading].pros.push(cleanLine);
          } else if (inCons) {
            subTradeoffs[currentSubheading].cons.push(cleanLine);
          }
        } else {
          if (inPros) {
            pros.push(cleanLine);
          } else if (inCons) {
            cons.push(cleanLine);
          }
        }
      }
    } else if (currentSection === 'operational complexity') {
      if (line.toLowerCase().includes('low')) complexity = 'Low';
      else if (line.toLowerCase().includes('medium')) complexity = 'Medium';
      else if (line.toLowerCase().includes('high')) complexity = 'High';
    } else if (currentSection === 'approximate monthly cost') {
      const match = line.match(/\$?([0-9]+(\.[0-9]+)?)/);
      if (match) {
        cost = parseFloat(match[1]);
      }
    } else if (currentSection === 'confidence rules') {
      if (line.startsWith('- ')) {
        const rule = parseConfidenceRuleLine(line);
        if (rule) {
          confidenceRules.push(rule);
        }
      }
    }
  }

  return { name, purpose, pros, cons, subTradeoffs, complexity, cost, confidenceRules };
}
