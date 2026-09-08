-- Canvas Appearance is persisted through the existing map_elements channel.
-- Keep the enum-like check strict while allowing this non-rendered campus
-- metadata record alongside the established element types.
alter table public.map_elements
  drop constraint if exists map_elements_element_type_check;

alter table public.map_elements
  add constraint map_elements_element_type_check check (element_type in (
    'room', 'classroom', 'laboratory', 'office', 'hallway', 'wall', 'door',
    'entrance', 'exit', 'stairs', 'elevator', 'ramp', 'restroom', 'clinic',
    'library', 'canteen', 'parking', 'gate', 'landmark', 'assembly_area',
    'emergency_exit', 'fire_extinguisher', 'information_desk', 'furniture',
    'custom', 'tree', 'bench', 'lamp', 'sign', 'bike_rack', 'garden', 'window',
    'chair', 'table', 'fire_alarm', 'fire_hydrant', 'cctv', 'security_post',
    'canvas_appearance'
  ));
