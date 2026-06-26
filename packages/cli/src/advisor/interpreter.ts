import * as fs from 'fs';
import * as path from 'path';

export interface ParsedKnowledge {
  name: string;
  purpose: string;
  pros: string[];
  cons: string[];
  subTradeoffs?: Record<string, { pros: string[]; cons: string[] }>;
  complexity: 'Low' | 'Medium' | 'High';
  cost: number;
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
    }
  }

  return { name, purpose, pros, cons, subTradeoffs, complexity, cost };
}
