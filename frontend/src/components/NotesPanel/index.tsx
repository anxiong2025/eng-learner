import { useMemo, useState, useEffect, useRef } from 'react';
import { useVideoStore } from '@/stores/videoStore';
import { useNoteStore } from '@/stores/noteStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Play, StickyNote, Pencil, Eye, X } from 'lucide-react';
import type { Note } from '@/types';

// Image preview component with click to view
function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <div className="relative group">
        <img
          src={src}
          alt={alt}
          className="h-16 w-auto rounded-md object-cover border border-border"
        />
        {/* Eye icon overlay */}
        <button
          onClick={() => setShowPreview(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md"
        >
          <Eye className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Modal overlay */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-150"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img
              src={src}
              alt={alt}
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
            />
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full bg-white/90 text-black shadow-lg hover:bg-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Simple markdown renderer component
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="text-xs text-foreground leading-relaxed space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // Headers: # ## ###
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="text-xs font-medium text-foreground">
              {renderInlineMarkdown(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="text-sm font-medium text-foreground">
              {renderInlineMarkdown(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} className="text-sm font-semibold text-foreground">
              {renderInlineMarkdown(trimmed.slice(2))}
            </h2>
          );
        }

        // List item: - text
        if (trimmed.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 items-baseline pl-1">
              <span className="text-muted-foreground text-[10px]">•</span>
              <span className="flex-1">{renderInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Hashtags: #tag1 #tag2 (no space after #)
        if (trimmed.match(/^#[\w\u4e00-\u9fa5]/)) {
          const tagMatches = trimmed.match(/#[\w\u4e00-\u9fa5]+/g);
          if (tagMatches && tagMatches.length > 0) {
            return (
              <div key={i} className="flex flex-wrap gap-1.5">
                {tagMatches.map((tag, j) => (
                  <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {tag.slice(1)}
                  </span>
                ))}
              </div>
            );
          }
        }

        // Empty line
        if (!trimmed) {
          return <div key={i} className="h-1" />;
        }

        // Regular text with inline formatting
        return <p key={i}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

// Render inline markdown (bold, etc)
function renderInlineMarkdown(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-medium">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// Fullscreen edit modal
interface EditModalProps {
  note: Note;
  editText: string;
  setEditText: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function EditModal({ note, editText, setEditText, onSave, onCancel }: EditModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
    // Cmd/Ctrl + Enter to save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-150 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Edit Note</span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(note.timestamp)}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">
          {/* Original subtitle if exists */}
          {(note.english || note.chinese) && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              {note.english && (
                <p className="text-sm text-foreground">{note.english}</p>
              )}
              {note.chinese && (
                <p className="text-xs text-muted-foreground mt-1">{note.chinese}</p>
              )}
            </div>
          )}

          {/* Edit textarea */}
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write your note..."
            className="w-full h-64 px-3 py-2 text-sm bg-background border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Images if any */}
          {note.images && note.images.length > 0 && (
            <div className="flex gap-2 mt-3">
              {note.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`Note image ${idx + 1}`}
                  className="h-20 w-auto rounded-md object-cover border border-border"
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          <span className="text-xs text-muted-foreground">
            ⌘/Ctrl + Enter to save · Esc to cancel
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NoteItemProps {
  note: Note;
  onSeek: (time: number) => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}

function NoteItem({ note, onSeek, onUpdate, onDelete }: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(note.note_text || '');

  const handleSaveEdit = () => {
    onUpdate(note.id, editText.trim());
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(note.note_text || '');
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditText(note.note_text || note.english || '');
    setIsEditing(true);
  };

  return (
    <>
      <div className="group p-2 rounded-lg hover:bg-muted/40 transition-colors">
        {/* Top row: timestamp + actions */}
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => onSeek(note.timestamp)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
          >
            <Play className="w-2.5 h-2.5" />
            <span className="font-mono">{formatTime(note.timestamp)}</span>
          </button>

          {/* Action buttons - show on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={handleStartEdit}
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={() => onDelete(note.id)}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Content - full width */}
        <div className="space-y-1">
          {note.english && (
            <p className="text-xs text-foreground leading-relaxed">{note.english}</p>
          )}
          {note.chinese && (
            <p className="text-[11px] text-muted-foreground">{note.chinese}</p>
          )}
          {note.note_text && (
            <MarkdownText text={note.note_text} />
          )}
          {/* Display images */}
          {note.images && note.images.length > 0 && (
            <div className="flex gap-1.5 mt-1.5 overflow-x-auto pb-1">
              {note.images.map((img, idx) => (
                <ImagePreview
                  key={idx}
                  src={img}
                  alt={`Note image ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <EditModal
          note={note}
          editText={editText}
          setEditText={setEditText}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      )}
    </>
  );
}

export function NotesPanel() {
  const { videoInfo, seekTo } = useVideoStore();
  const { notes, removeNote, updateNote } = useNoteStore();

  const videoNotes = useMemo(() => {
    if (!videoInfo) return [];
    return notes
      .filter((n) => n.video_id === videoInfo.video_id)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [notes, videoInfo]);

  if (!videoInfo) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>Load a video to see notes</p>
      </div>
    );
  }

  if (videoNotes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
        <StickyNote className="w-12 h-12 opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium">No notes yet</p>
          <p className="text-xs mt-1">
            Use the input below the video to add notes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
        <span className="text-xs text-muted-foreground">
          {videoNotes.length} note{videoNotes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5">
          {videoNotes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onSeek={seekTo}
              onUpdate={updateNote}
              onDelete={removeNote}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
