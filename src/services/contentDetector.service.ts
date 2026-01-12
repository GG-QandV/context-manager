export type ContentType = 'code' | 'command' | 'list' | 'table' | 'error' | 'text';

export class ContentDetectorService {
  detectTypes(content: string): ContentType[] {
    const types: ContentType[] = [];
    
    // Code blocks (```...```)
    if (/```[\s\S]*?```/.test(content)) {
      types.push('code');
    }
    
    // Commands (starts with $ or contains curl/docker/npm/git)
    if (/^[\$>]\s+/.test(content) || /\b(curl|docker|npm|git|node|psql)\s/.test(content)) {
      types.push('command');
    }
    
    // Lists (- item or 1. item)
    if (/^[\s]*[-*]\s+/m.test(content) || /^[\s]*\d+\.\s+/m.test(content)) {
      types.push('list');
    }
    
    // Tables (| col | col |)
    if (/\|.*\|.*\|/.test(content)) {
      types.push('table');
    }
    
    // Errors (keywords)
    if (/\b(error|failed|exception|traceback|fatal|errno)\b/i.test(content)) {
      types.push('error');
    }
    
    // Default to text if nothing detected
    if (types.length === 0) {
      types.push('text');
    }
    
    return types;
  }
}

export const contentDetector = new ContentDetectorService();
