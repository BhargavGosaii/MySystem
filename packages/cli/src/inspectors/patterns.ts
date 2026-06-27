import * as fs from 'fs';
import * as path from 'path';
import { scanProjectFiles, getIgnorePatterns } from '../utils/scanner';

export interface PatternFacts {
  hasWebsockets: boolean;
  hasFileUploads: boolean;
  hasDirectDbConnections: boolean;
}

export async function inspectPatterns(projectRoot: string): Promise<PatternFacts> {
  const facts: PatternFacts = {
    hasWebsockets: false,
    hasFileUploads: false,
    hasDirectDbConnections: false,
  };

  const ignorePatterns = getIgnorePatterns(projectRoot);
  const files = scanProjectFiles(projectRoot, projectRoot, ignorePatterns);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');

      // Detect websockets
      if (
        content.includes('socket.io') ||
        content.includes("from 'ws'") ||
        content.includes('require("ws")') ||
        content.includes('new WebSocketServer')
      ) {
        facts.hasWebsockets = true;
      }

      // Detect uploads
      if (
        content.includes('multer') ||
        content.includes('@aws-sdk/client-s3') ||
        content.includes('s3.upload(') ||
        content.includes('uploadToS3') ||
        content.includes('formidable') ||
        content.includes('busboy')
      ) {
        facts.hasFileUploads = true;
      }

      // Detect direct DB connection pools
      if (
        content.includes('new Pool(') ||
        content.includes('pg.Pool(') ||
        content.includes('mongoose.connect') ||
        content.includes('createConnection') ||
        content.includes('mysql.createPool') ||
        content.includes('PrismaClient')
      ) {
        facts.hasDirectDbConnections = true;
      }

      // Break early if everything is already found
      if (facts.hasWebsockets && facts.hasFileUploads && facts.hasDirectDbConnections) {
        break;
      }
    } catch {
      // Ignore reading errors
    }
  }

  return facts;
}

