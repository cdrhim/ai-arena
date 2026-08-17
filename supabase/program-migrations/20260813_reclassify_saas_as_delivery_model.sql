-- Program DB (`program managing _ sparkclaw`) data-quality correction.
-- `sector` represents the customer market. SaaS is a delivery/business model,
-- so active participant profiles must use a market-facing classification.
-- The current value is part of every WHERE guard to avoid overwriting a later
-- operator correction when this script is reviewed or re-run.

begin;

update public.teams
set sector = case id
  when '0729f8d1-7fdb-4ccc-9cad-e062ac06b5b8' then 'Gaming/e-Sports'
  when '16be938c-6071-47d1-a8eb-7c5ef96a990e' then 'RetailTech/Commerce Operations'
  when '210cfe27-4d0c-45fe-91ec-ea7aeb5e8ff3' then 'Financial Services/Fintech'
  when '275b600e-d413-4bd8-a6c9-0e09100cd4e6' then 'Advertising/Adtech'
  when '27ac965e-d901-4602-89de-a77453009b33' then 'Enterprise AI/IT Infrastructure'
  when '3bf02143-b459-4cb1-98b5-79e7769303e1' then 'Semiconductor/Deeptech'
  when '41535a1a-7c91-4657-8028-27a2470f6662' then 'Developer Tools/DevTech'
  when '4dfaaeae-a89f-4f38-9007-5d009327ab64' then 'Advertising/Adtech'
  when '54c23991-b5df-4e51-8e48-b18450c58903' then 'Enterprise Services/IT Automation'
  when '7fc57446-e918-4297-a2f2-1b68a5990c31' then 'Advertising/Adtech'
  when '8e64a35f-8bbb-4369-b871-f9c2d4aefa61' then 'Enterprise Finance/ERP Automation'
  when 'afc818d7-d6e6-4988-92c6-f830cc2fe876' then 'Beauty/Tattoo Marketplace'
  when 'b02edb89-7c61-41ed-9c6e-00af6a571d3c' then 'Workplace/Productivity'
  when 'b24cd279-b358-4b02-8d40-e54912b0e66c' then 'RetailTech/CRM'
  when 'c6a29706-03a8-4ccb-a620-b65fceb33b4f' then 'LegalTech/IP'
  else sector
end
where id in (
  '0729f8d1-7fdb-4ccc-9cad-e062ac06b5b8',
  '16be938c-6071-47d1-a8eb-7c5ef96a990e',
  '210cfe27-4d0c-45fe-91ec-ea7aeb5e8ff3',
  '275b600e-d413-4bd8-a6c9-0e09100cd4e6',
  '27ac965e-d901-4602-89de-a77453009b33',
  '3bf02143-b459-4cb1-98b5-79e7769303e1',
  '41535a1a-7c91-4657-8028-27a2470f6662',
  '4dfaaeae-a89f-4f38-9007-5d009327ab64',
  '54c23991-b5df-4e51-8e48-b18450c58903',
  '7fc57446-e918-4297-a2f2-1b68a5990c31',
  '8e64a35f-8bbb-4369-b871-f9c2d4aefa61',
  'afc818d7-d6e6-4988-92c6-f830cc2fe876',
  'b02edb89-7c61-41ed-9c6e-00af6a571d3c',
  'b24cd279-b358-4b02-8d40-e54912b0e66c',
  'c6a29706-03a8-4ccb-a620-b65fceb33b4f'
)
and lower(trim(coalesce(sector, ''))) = 'saas';

-- Preserve the already-known customer market and remove SaaS from the
-- comma-separated industry label. Product delivery details remain in the
-- profile summary, AI idea, and keyword evidence.
update public.teams
set sector = case id
  when '28745d67-6f46-402a-b0a3-6647b8824860' then 'Advertising/Adtech'
  when 'b8466b05-9917-4f2d-80e4-b90b559cb1ce' then 'e-Commerce/Marketplace'
  when 'a0c55162-b615-40ba-be53-3a289606d861' then 'Healthcare/Medicaltech'
  when 'd27944b1-4a75-4075-a75d-cc30fc10082a' then 'Human Resource/HRtech'
  when 'f3d072bc-be50-4841-89f0-80c893a6bfe1' then 'e-Commerce/Marketplace'
  when '3cbee901-9e92-471e-aea3-07bbccc96005' then 'Foodtech'
  when '36cf192c-64c7-4242-9f7e-72aa3c6d2faf' then 'Human Resource/HRtech'
  else sector
end
where id in (
  '28745d67-6f46-402a-b0a3-6647b8824860',
  'b8466b05-9917-4f2d-80e4-b90b559cb1ce',
  'a0c55162-b615-40ba-be53-3a289606d861',
  'd27944b1-4a75-4075-a75d-cc30fc10082a',
  'f3d072bc-be50-4841-89f0-80c893a6bfe1',
  '3cbee901-9e92-471e-aea3-07bbccc96005',
  '36cf192c-64c7-4242-9f7e-72aa3c6d2faf'
)
and sector ilike '%saas%';

-- This assertion deliberately aborts the transaction if an active,
-- non-test participant still exposes SaaS as its industry.
do $$
begin
  if exists (
    select 1
    from public.teams
    where not coalesce(dropped_out, false)
      and not coalesce(is_test_account, false)
      and sector ilike '%saas%'
  ) then
    raise exception 'Active participant sector still contains SaaS';
  end if;
end $$;

commit;
