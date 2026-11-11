"use client";

import { useEffect, useState } from 'react';
import { dueIso, replyDisplayName, type TaskDue } from '@/lib/outbox-model';
import type { ReplyWithLead } from '@/lib/outreach';
import { Button, Field, Input, Modal, Select } from '../ui';

export function ConfirmCancelModal({ open, title, busy, onClose, onConfirm }: { open: boolean; title: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this email?"
      description={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            Cancel email
          </Button>
        </div>
      }
    >
      <p className="text-sm text-fg-muted">It will not be sent. You can write a new pitch for this lead later.</p>
    </Modal>
  );
}

export function CreateTaskModal({
  reply,
  busy,
  onClose,
  onCreate,
}: {
  reply: ReplyWithLead | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (title: string, due: string | null) => void;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<TaskDue>('tomorrow');
  useEffect(() => {
    if (reply) {
      setTitle(`Follow up with ${replyDisplayName(reply)}`);
      setDue('tomorrow');
    }
  }, [reply]);
  return (
    <Modal
      open={!!reply}
      onClose={onClose}
      title="Create a task"
      description={reply?.lead?.title ?? undefined}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!title.trim()} onClick={() => onCreate(title.trim(), dueIso(due))}>
            Add task
          </Button>
        </div>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && !busy) onCreate(title.trim(), dueIso(due));
        }}
      >
        <Field label="What needs doing?" htmlFor="outbox-task-title">
          <Input id="outbox-task-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="When" htmlFor="outbox-task-due">
          <Select id="outbox-task-due" value={due} onChange={(e) => setDue(e.target.value as TaskDue)}>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="in3">In 3 days</option>
            <option value="nextweek">Next week</option>
            <option value="none">No date</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
