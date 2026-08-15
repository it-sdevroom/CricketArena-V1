-- ============================================================================
-- Cricket Arena — richer commentary
-- ============================================================================
-- The feed could only ever say "Khan to Hussain, FOUR" because a delivery
-- records numbers, not what the shot looked like. A scorer who can tap
-- "driven through the covers" turns a bare scorecard into something worth
-- reading, and it costs one optional column.
--
-- Free text rather than an enum: shot vocabulary varies by format and region,
-- and an enum would need a migration every time someone wanted a new phrase.
-- The app offers presets; anything typed still fits.
-- ============================================================================

alter table deliveries add column shot text check (shot is null or length(shot) <= 80);

comment on column deliveries.shot is
  'Optional description of the shot or dismissal, e.g. "driven through the covers". Shown in commentary.';
