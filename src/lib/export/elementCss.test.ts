import { describe, expect, it } from 'vitest';
import { consolidateCSSRules } from './elementCss';

describe('element CSS helpers', () => {
  it('consolidates shared visual declarations while preserving per-selector placement rules', () => {
    const css = [
      '    .el-card_a{position:absolute;left:10px;top:20px;width:100px;height:40px;color:red;background:white}',
      '    .el-card_b{position:absolute;left:30px;top:60px;width:100px;height:40px;color:red;background:white}',
    ].join('\n');

    expect(consolidateCSSRules(css)).toBe([
      '    .el-card_a, .el-card_b{position:absolute;width:100px;height:40px;color:red;background:white}',
      '    .el-card_a{left:10px;top:20px}',
      '    .el-card_b{left:30px;top:60px}',
    ].join('\n'));
  });

  it('keeps singleton rules byte-stable', () => {
    const css = '  .el_single{position:absolute;left:1px;top:2px;color:blue}';

    expect(consolidateCSSRules(css)).toBe(css);
  });
});
