import * as fs from 'fs';
import * as path from 'path';

export interface ConfidenceRule {
  conditions: string[];       // e.g. ['hasWebsockets', 'queueLib']
  operator: 'AND' | 'OR';
  negated: boolean;           // true if the rule starts with NOT
  result: string;             // e.g. 'ecs-fargate', 'true', 'false'
  confidence: number;         // 0-100
}

export interface AlternativeConfig {
  name: string;
  costTier: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
  complexityTier: 'Low' | 'Medium' | 'High';
}

export interface ParsedDecisionKnowledge {
  decisionName: string;
  defaultChoice: string;
  costTier: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
  complexityTier: 'Low' | 'Medium' | 'High';
  alternatives: AlternativeConfig[];
  
  purpose: string;
  indicators: string[];
  avoidWhen: string[];
  migrationTriggers: string[];
  tradeoffs: Record<string, { pros: string[]; cons: string[] }>;
  confidenceRules: ConfidenceRule[];
}

/**
 * Parses a single confidence rule line.
 * Format: "- IF condition1 OR condition2 THEN result CONFIDENCE 95"
 */
function parseConfidenceRuleLine(line: string): ConfidenceRule | null {
  const cleaned = line.replace(/^-\s*/, '').trim();

  const match = cleaned.match(/^IF\s+(.+?)\s+THEN\s+(\S+)\s+CONFIDENCE\s+(\d+)$/i);
  if (!match) return null;

  const conditionBlock = match[1].trim();
  const result = match[2].trim();
  const confidence = parseInt(match[3], 10);

  const negated = conditionBlock.toUpperCase().startsWith('NOT ');

  const hasOr = /\s+OR\s+/i.test(conditionBlock);
  const operator: 'AND' | 'OR' = hasOr ? 'OR' : 'AND';

  const splitRegex = hasOr ? /\s+OR\s+/i : /\s+AND\s+/i;
  const conditions = conditionBlock
    .split(splitRegex)
    .map(c => c.replace(/^NOT\s+/i, '').trim())
    .filter(c => c.length > 0);

  return { conditions, operator, negated, result, confidence };
}

/**
 * Simple key-value and nested array YAML parser.
 */
function parseYaml(content: string): any {
  const obj: any = {};
  const lines = content.split('\n');
  let currentArrayKey: string | null = null;
  let currentArrayItem: any = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('-')) {
      if (currentArrayKey) {
        if (!obj[currentArrayKey]) obj[currentArrayKey] = [];
        const cleanLine = line.slice(1).trim();
        const kvMatch = cleanLine.match(/^([^:]+):\s*(.*)$/);
        if (kvMatch) {
          const k = kvMatch[1].trim();
          let v: any = kvMatch[2].trim();
          v = v.replace(/^["']|["']$/g, '');
          currentArrayItem = { [k]: v };
          obj[currentArrayKey].push(currentArrayItem);
        }
      }
      continue;
    }

    if (line.includes(':') && currentArrayItem) {
      const kvMatch = line.match(/^([^:]+):\s*(.*)$/);
      if (kvMatch) {
        const k = kvMatch[1].trim();
        let v: any = kvMatch[2].trim();
        v = v.replace(/^["']|["']$/g, '');
        currentArrayItem[k] = v;
        continue;
      }
    }

    const kvMatch = line.match(/^([^:]+):\s*(.*)$/);
    if (kvMatch) {
      const k = kvMatch[1].trim();
      let v: any = kvMatch[2].trim();
      v = v.replace(/^["']|["']$/g, '');
      
      if (v === '') {
        currentArrayKey = k;
        currentArrayItem = null;
      } else {
        obj[k] = v;
        currentArrayKey = null;
        currentArrayItem = null;
      }
    }
  }

  return obj;
}

export function parseDecisionModule(moduleDir: string): ParsedDecisionKnowledge {
  const definitionPath = path.join(moduleDir, 'definition.yaml');
  const advisorPath = path.join(moduleDir, 'advisor.md');

  if (!fs.existsSync(definitionPath) || !fs.existsSync(advisorPath)) {
    throw new Error(`Invalid decision module at: ${moduleDir}. Both definition.yaml and advisor.md are required.`);
  }

  const defContent = fs.readFileSync(definitionPath, 'utf8');
  const def = parseYaml(defContent);

  const advisorContent = fs.readFileSync(advisorPath, 'utf8');
  const lines = advisorContent.split('\n');

  const indicators: string[] = [];
  const avoidWhen: string[] = [];
  const migrationTriggers: string[] = [];
  const tradeoffs: Record<string, { pros: string[]; cons: string[] }> = {};
  const confidenceRules: ConfidenceRule[] = [];
  let purpose = '';

  let currentSection = '';
  let currentSubheading = '';
  let inPros = false;
  let inCons = false;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').toLowerCase().trim();
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
    } else if (currentSection === 'indicators') {
      if (line.startsWith('- ')) {
        indicators.push(line.replace('- ', '').trim());
      }
    } else if (currentSection === 'avoid when') {
      if (line.startsWith('- ')) {
        avoidWhen.push(line.replace('- ', '').trim());
      }
    } else if (currentSection === 'migration triggers') {
      if (line.startsWith('- ')) {
        migrationTriggers.push(line.replace('- ', '').trim());
      }
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
        const cleanLine = line.replace('- ', '').replace(/\*\*/g, '').trim();
        if (currentSubheading) {
          if (!tradeoffs[currentSubheading]) {
            tradeoffs[currentSubheading] = { pros: [], cons: [] };
          }
          if (inPros) {
            tradeoffs[currentSubheading].pros.push(cleanLine);
          } else if (inCons) {
            tradeoffs[currentSubheading].cons.push(cleanLine);
          }
        }
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

  return {
    decisionName: def.decisionName || 'Unnamed Decision',
    defaultChoice: def.defaultChoice || 'none',
    costTier: def.costTier || 'Low',
    complexityTier: def.complexityTier || 'Low',
    alternatives: def.alternatives || [],
    purpose,
    indicators,
    avoidWhen,
    migrationTriggers,
    tradeoffs,
    confidenceRules
  };
}

export interface ParsedKnowledge {
  name: string;
  purpose: string;
  pros: string[];
  cons: string[];
  complexity: 'Low' | 'Medium' | 'High';
  cost: number;
  confidenceRules: ConfidenceRule[];
}

export function parseKnowledgeFile(filePath: string): ParsedKnowledge {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Knowledge file not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let purpose = '';

  for (let line of lines) {
    line = line.trim();
    // Exclude header tags
    if (line && !line.startsWith('#')) {
      purpose += (purpose ? ' ' : '') + line;
    }
  }

  return {
    name: path.basename(filePath, '.md'),
    purpose,
    pros: [],
    cons: [],
    complexity: 'Low',
    cost: 0,
    confidenceRules: []
  };
}
