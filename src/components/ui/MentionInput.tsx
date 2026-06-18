import React, { useState, useRef, useEffect, useCallback } from 'react';
import { searchUsersForMention } from '../../lib/mentions';
import { getOptimizedImageUrl } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** If true, renders as a single-line input. Default: true */
  singleLine?: boolean;
}

interface MentionSuggestion {
  id: string;
  name: string;
  username?: string;
  profilePicture?: string;
  school?: string;
}

export default function MentionInput({
  value,
  onChange,
  placeholder,
  className = '',
  disabled,
  id,
  onKeyDown,
  singleLine = true,
}: MentionInputProps) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect @mention trigger as user types
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart || 0;
    // Look backwards from cursor to find an @ that starts a mention
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex >= 0) {
      // Check that the @ is at the start or preceded by a space
      const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        const queryText = textBeforeCursor.slice(lastAtIndex + 1);
        // Only show suggestions if the query doesn't contain spaces
        if (!queryText.includes(' ') && queryText.length >= 0) {
          setMentionQuery(queryText);
          setMentionStartPos(lastAtIndex);
          if (queryText.length >= 1) {
            // Debounce search
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(async () => {
              if (!user) return;
              const results = await searchUsersForMention(queryText, user.uid);
              setSuggestions(results);
              setShowSuggestions(results.length > 0);
              setSelectedIndex(0);
            }, 200);
          } else {
            setShowSuggestions(false);
          }
          return;
        }
      }
    }

    // No active mention
    setShowSuggestions(false);
    setMentionStartPos(-1);
  }, [onChange, user]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    // Pass through to parent handler
    onKeyDown?.(e);
  }, [showSuggestions, suggestions, selectedIndex, onKeyDown]);

  // Insert the selected mention
  const selectSuggestion = useCallback((suggestion: MentionSuggestion) => {
    if (mentionStartPos < 0) return;

    const handle = suggestion.username || suggestion.name.replace(/\s+/g, '').toLowerCase();
    const before = value.slice(0, mentionStartPos);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const after = value.slice(cursorPos);

    const newValue = `${before}@${handle} ${after}`;
    onChange(newValue);
    setShowSuggestions(false);
    setMentionStartPos(-1);

    // Focus back on input and set cursor position
    requestAnimationFrame(() => {
      if (inputRef.current) {
        const newCursorPos = before.length + handle.length + 2; // +2 for @ and space
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  }, [mentionStartPos, value, onChange]);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute bottom-full left-0 right-0 mb-2 bg-surface-card rounded-2xl shadow-2xl border overflow-hidden z-50"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="px-3 py-2 border-b border-luxury-ink/5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-luxury-ink/30">
              Mention someone
            </span>
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSuggestion(s)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                i === selectedIndex
                  ? 'bg-brand-teal/8'
                  : 'hover:bg-surface-soft'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center overflow-hidden shrink-0 border border-luxury-ink/5">
                {s.profilePicture ? (
                  <img
                    src={getOptimizedImageUrl(s.profilePicture)}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-brand-teal font-bold text-[11px]">
                    {s.name[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-luxury-ink truncate">{s.name}</span>
                  {s.username && (
                    <span className="text-[11px] text-luxury-ink/40 font-medium">@{s.username}</span>
                  )}
                </div>
                {s.school && (
                  <span className="text-[10px] text-luxury-ink/30 font-medium">{s.school}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
