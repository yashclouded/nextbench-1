import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
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

  // Split by URLs first
  const parts = text.split(URL_REGEX);

  return (
    <p className="leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-teal hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
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
