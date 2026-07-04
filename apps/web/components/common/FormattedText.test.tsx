import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FormattedText } from './FormattedText';

describe('FormattedText', () => {
  it('renders nothing for empty text', () => {
    const { container } = render(<FormattedText text={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders markdown bold and safe links', () => {
    const { container, getByText } = render(
      <FormattedText text={'See **the docs** at [site](https://example.com)'} />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('the docs');
    const link = getByText('site').closest('a')!;
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('strips a javascript: URL from a markdown link (renders label as text)', () => {
    const { container } = render(
      <FormattedText text={'[click](javascript:alert(1))'} />,
    );
    // Label text survives, but no anchor carrying a javascript: href is emitted.
    expect(container.textContent).toContain('click');
    const anchors = Array.from(container.querySelectorAll('a'));
    expect(anchors.some((a) => (a.getAttribute('href') ?? '').toLowerCase().startsWith('javascript:'))).toBe(false);
  });

  it('sanitises raw HTML — drops script and event handlers', () => {
    const { container } = render(
      <FormattedText text={'<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(2)>'} />,
    );
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    // img is not in the allow-list; if present it must not carry an onerror handler
    expect(img?.getAttribute('onerror') ?? null).toBeNull();
    expect(container.textContent).toContain('Hello');
  });

  it('forces external links to open safely', () => {
    const { container } = render(
      <FormattedText text={'<a href="https://example.com">x</a>'} />,
    );
    const a = container.querySelector('a')!;
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  });
});
