import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WysiwygEditor } from './WysiwygEditor';

vi.mock('./AiAssist', () => ({
  AiAssistButton: ({ onApply }: { onApply: (value: string) => void }) => (
    <button type="button" aria-label="Apply mocked AI suggestion" onClick={() => onApply('Led Q4 launch for 12 vehicles.')}>
      Apply suggestion
    </button>
  )
}));

describe('WysiwygEditor', () => {
  it('updates visible editor content immediately after accepting an AI suggestion', () => {
    const Harness = () => {
      const [value, setValue] = useState('Led Q4 launch for 12 vehicles across multiple teams.');
      return <WysiwygEditor ariaLabel="Profile highlight item" value={value} onChange={setValue} />;
    };

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Apply mocked AI suggestion' }));

    expect(screen.getByLabelText('Profile highlight item')).toHaveTextContent('Led Q4 launch for 12 vehicles.');
  });
});
