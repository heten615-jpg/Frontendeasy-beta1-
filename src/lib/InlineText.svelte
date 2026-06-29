<script lang="ts">
  import type { TextRun } from '../types';

  export let content = '';
  export let runs: TextRun[] | undefined = undefined;

  $: visibleRuns = runs?.length && runs.map(run => run.text).join('') === content
    ? runs
    : [{ text: content }];
</script>

{#each visibleRuns as run}
  <span
    class:inline-link={!!run.href || !!run.targetFrameId}
    style:font-weight={run.bold ? '700' : undefined}
    style:font-style={run.italic ? 'italic' : undefined}
    style:text-decoration={run.underline ? 'underline' : undefined}
  >{run.text}</span>
{/each}

<style>
  .inline-link {
    color: #72b7ff;
    text-decoration: underline;
  }
</style>
