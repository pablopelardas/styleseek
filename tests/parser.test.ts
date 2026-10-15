import { describe, expect, it } from 'vitest';

import { parseCss, parseScss } from '../src/parsers';
import { describeEntries, findEntry, selectorsOf, TREE_SCSS } from './helpers';

describe('SCSS nesting reconstruction', () => {
  it('rebuilds simple BEM nesting with exact positions', () => {
    const { entries, errors } = parseScss('/p/_tree.scss', TREE_SCSS);

    expect(errors).toEqual([]);
    expect(describeEntries(entries)).toEqual([
      '.org-tree @ 1:1',
      '.org-tree__header @ 2:3',
      '.org-tree__controls @ 6:3',
      '.org-tree__controls-button @ 9:5',
    ]);
  });

  it('keeps the source token so navigation can highlight it', () => {
    const { entries } = parseScss('/p/_tree.scss', TREE_SCSS);
    const button = findEntry(entries, '.org-tree__controls-button');

    expect(button?.sourceSelector).toBe('&-button');
    expect(button?.preview).toBe('&-button {');
    expect(button?.length).toBe('&-button'.length);
  });

  it('handles three or more BEM levels', () => {
    const source = `.a {
  &__b {
    &--active {
      &-icon {
        color: red;
      }
    }
  }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.a',
      '.a__b',
      '.a__b--active',
      '.a__b--active-icon',
    ]);
  });

  it('keeps descendant selectors separated by a space', () => {
    const source = `.container {
  .button {
    color: red;
  }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.container',
      '.container .button',
    ]);
  });

  it('supports child, sibling and general sibling combinators', () => {
    const source = `.list {
  > .item { color: red; }
  + .after { color: red; }
  ~ .later { color: red; }
  & > .direct { color: red; }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.list',
      '.list > .item',
      '.list + .after',
      '.list ~ .later',
      '.list > .direct',
    ]);
  });

  it('resolves pseudo-classes and flags them', () => {
    const source = `.button {
  &:hover { color: blue; }
  &:focus { outline: none; }
  &:not(.disabled, .loading) { color: green; }
}`;
    const { entries } = parseScss('/p/a.scss', source);

    expect(selectorsOf(entries)).toEqual([
      '.button',
      '.button:hover',
      '.button:focus',
      '.button:not(.disabled, .loading)',
    ]);
    expect(findEntry(entries, '.button')?.hasPseudo).toBe(false);
    expect(findEntry(entries, '.button:hover')?.hasPseudo).toBe(true);
  });

  it('expands selector lists into independent, separately located entries', () => {
    const source = `.card {
  &__title,
  &__subtitle {
    color: white;
  }
}`;

    expect(describeEntries(parseScss('/p/a.scss', source).entries)).toEqual([
      '.card @ 1:1',
      '.card__title @ 2:3',
      '.card__subtitle @ 3:3',
    ]);
  });

  it('builds the cartesian product of parent and child lists', () => {
    const source = `.a, .b {
  &__x, &__y { color: red; }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.a',
      '.b',
      '.a__x',
      '.b__x',
      '.a__y',
      '.b__y',
    ]);
  });

  it('does not split on commas inside functional pseudo-classes', () => {
    const { entries } = parseScss('/p/a.scss', ':is(.a, .b) .c { color: red; }');

    expect(selectorsOf(entries)).toEqual([':is(.a, .b) .c']);
  });

  it('supports attribute selectors containing commas and ampersands', () => {
    const source = `.input {
  &[data-kind="a,b"] { color: red; }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.input',
      '.input[data-kind="a,b"]',
    ]);
  });

  it('replaces every & occurrence, including suffix position', () => {
    const source = `.theme-dark {
  .page & { color: red; }
  & + & { margin: 0; }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.theme-dark',
      '.page .theme-dark',
      '.theme-dark + .theme-dark',
    ]);
  });

  it('treats at-rules as transparent to the nesting context', () => {
    const source = `.card {
  @media (min-width: 600px) {
    &__body { color: red; }
  }
  @supports (display: grid) {
    &__grid { display: grid; }
  }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.card',
      '.card__body',
      '.card__grid',
    ]);
  });

  it('never indexes keyframe steps as selectors', () => {
    const source = `@keyframes spin {
  0% { opacity: 0; }
  from { opacity: 0; }
  to { opacity: 1; }
}
.spinner { animation: spin 1s; }`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual(['.spinner']);
  });

  it('refuses to invent a parent for & inside a mixin', () => {
    const source = `@mixin elevated {
  &__shadow { box-shadow: 0 0 1px; }
  .plain { color: red; }
}`;
    const { entries } = parseScss('/p/a.scss', source);

    expect(selectorsOf(entries)).toEqual(['.plain']);
  });

  it('resolves @at-root against the document root', () => {
    const source = `.wrapper {
  @at-root .escaped {
    &__child { color: red; }
  }
}`;

    expect(selectorsOf(parseScss('/p/a.scss', source).entries)).toEqual([
      '.wrapper',
      '.escaped',
      '.escaped__child',
    ]);
  });

  it('keeps unresolvable interpolation literal instead of guessing', () => {
    const source = `$prefix: 'app';

.#{$prefix}-button {
  &__icon { color: red; }
}`;
    const { entries } = parseScss('/p/a.scss', source);

    expect(selectorsOf(entries)).toEqual(['.#{$prefix}-button', '.#{$prefix}-button__icon']);
    expect(entries[0].hasInterpolation).toBe(true);
    expect(entries[0].line).toBe(3);
    expect(entries[0].column).toBe(1);
  });

  it('reports a syntax error instead of throwing', () => {
    const { entries, errors } = parseScss('/p/broken.scss', '.a { color: red;\n.b { ');

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unclosed/i);
    expect(errors[0].line).toBe(2);
  });
});

describe('CSS parsing', () => {
  it('indexes plain CSS rules', () => {
    const { entries } = parseCss('/p/a.css', '.a, .b { color: red; }\n#id .c { color: red; }');

    expect(describeEntries(entries)).toEqual(['.a @ 1:1', '.b @ 1:5', '#id .c @ 2:1']);
  });

  it('understands native CSS nesting', () => {
    const { entries } = parseCss('/p/a.css', '.card {\n  & .title { color: red; }\n}');

    expect(selectorsOf(entries)).toEqual(['.card', '.card .title']);
  });
});
