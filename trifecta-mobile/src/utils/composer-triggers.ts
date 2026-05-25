/**
 * Composer trigger detection for @ mentions, / slash commands, and $ skills.
 * Ported from iOS ComposerTriggerLogic with adaptations for React Native TextInput.
 */

export enum ComposerTriggerKind {
  Path = "path",
  SlashCommand = "slashCommand",
  Skill = "skill",
}

export interface ComposerTrigger {
  kind: ComposerTriggerKind;
  query: string;
  rangeStart: number;
  rangeEnd: number;
}

const SLASH_COMMAND_REGEX = /^\/(\S*)$/;

function clampCursor(length: number, cursor: number): number {
  return Math.max(0, Math.min(length, cursor));
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function tokenStart(text: string, cursor: number): number {
  let index = cursor - 1;
  while (index >= 0) {
    if (isWhitespace(text[index])) {
      break;
    }
    index -= 1;
  }
  return index + 1;
}

function lineStart(text: string, cursor: number): number {
  const capped = clampCursor(text.length, cursor);
  if (capped <= 0) return 0;
  
  const search = text.substring(0, capped);
  const lastNewline = search.lastIndexOf('\n');
  if (lastNewline !== -1) {
    return lastNewline + 1;
  }
  return 0;
}

/**
 * Detects if the cursor is currently within a trigger (@ / $).
 * Returns trigger info if found, null otherwise.
 */
export function detectTrigger(text: string, cursor: number): ComposerTrigger | null {
  const len = text.length;
  const clampedCursor = clampCursor(len, cursor);

  // Check for slash commands at the start of a line
  const lineStartIndex = lineStart(text, clampedCursor);
  const lineLen = clampedCursor - lineStartIndex;
  if (lineLen >= 0 && lineStartIndex + lineLen <= len) {
    const linePrefix = text.substring(lineStartIndex, lineStartIndex + lineLen);
    if (linePrefix.startsWith('/')) {
      const match = linePrefix.match(SLASH_COMMAND_REGEX);
      if (match && match.length >= 2) {
        const commandQuery = match[1] || '';
        return {
          kind: ComposerTriggerKind.SlashCommand,
          query: commandQuery,
          rangeStart: lineStartIndex,
          rangeEnd: clampedCursor,
        };
      }
    }
  }

  // Check for @ mentions and $ skills
  const tokenStartIndex = tokenStart(text, clampedCursor);
  const tokenLen = clampedCursor - tokenStartIndex;
  
  if (tokenLen > 0 && tokenStartIndex + tokenLen <= len) {
    const token = text.substring(tokenStartIndex, tokenStartIndex + tokenLen);
    
    if (token.startsWith('$')) {
      return {
        kind: ComposerTriggerKind.Skill,
        query: token.substring(1),
        rangeStart: tokenStartIndex,
        rangeEnd: clampedCursor,
      };
    }
    
    if (token.startsWith('@')) {
      return {
        kind: ComposerTriggerKind.Path,
        query: token.substring(1),
        rangeStart: tokenStartIndex,
        rangeEnd: clampedCursor,
      };
    }
  }

  return null;
}

/**
 * Replaces a range of text with a replacement string.
 * Returns the new text and the new cursor position.
 */
export function replaceRange(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  replacement: string,
): { text: string; cursor: number } {
  const len = text.length;
  const start = Math.max(0, Math.min(len, rangeStart));
  const end = Math.max(start, Math.min(len, rangeEnd));
  
  const prefix = text.substring(0, start);
  const suffix = text.substring(end);
  const next = prefix + replacement + suffix;
  const cursor = start + replacement.length;
  
  return { text: next, cursor };
}

/**
 * Parses standalone slash commands for mode switching.
 */
export function parseStandaloneModeSlash(trimmed: string): 'plan' | 'default' | null {
  const t = trimmed.trim();
  if (/^\/plan\s*$/i.test(t)) return 'plan';
  if (/^\/default\s*$/i.test(t)) return 'default';
  return null;
}

/**
 * Checks if the text is a standalone /model command.
 */
export function isStandaloneModelSlash(trimmed: string): boolean {
  const t = trimmed.trim();
  return /^\/model\s*$/i.test(t);
}