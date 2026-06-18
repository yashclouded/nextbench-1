import React from 'react';

import { Link } from 'react-router-dom';

const URL_AND_MENTION_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)|(@[a-zA-Z][a-zA-Z0-9_.]{2,19})\b/g;
const EMOJI_REGEX = /([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)/gu;

interface MessageTextProps {
  text?: string;
}

export default function MessageText({ text }: MessageTextProps) {
  if (!text) return null;

  // Check if the entire message is ONLY emojis (ignoring spaces)
  const textWithoutSpaces = text.replace(/\s+/g, '');
  const onlyEmojis = textWithoutSpaces.length > 0 && textWithoutSpaces.replace(EMOJI_REGEX, '').length === 0;

  if (onlyEmojis) {
    return <p className="text-4xl leading-relaxed">{text}</p>;
  }

  // Split by URLs and Mentions first
  const parts = text.split(URL_AND_MENTION_REGEX);

  return (
    <p className="leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (!part) return null; // regex split includes undefined for unmatched groups

        // If part is a URL
        if (part.match(/^(https?:\/\/|www\.)/)) {
          const href = part.startsWith('http') ? part : `https://${part}`;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-teal hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }

        // If part is a mention
        if (part.match(/^@[a-zA-Z][a-zA-Z0-9_.]{2,19}$/)) {
          const username = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              to={`/u/${username}`}
              className="text-brand-teal font-semibold hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }

        // Parse emojis in text parts
        const subParts = part.split(EMOJI_REGEX);
        return subParts.map((subPart, j) => {
          if (subPart.match(EMOJI_REGEX)) {
            return (
              <span key={`${i}-${j}`} className="text-2xl">
                {subPart}
              </span>
            );
          }
          return subPart;
        });
      })}
    </p>
  );
}
