-- Prevent direct API inserts from creating scheduled appointments in the past.
-- Walk-ins remain valid because they are stored without a scheduled_start.

create or replace function public.validate_new_appointment_times()
returns trigger
language plpgsql
as $$
begin
  if new.scheduled_start is not null
     and new.status in ('scheduled', 'rescheduled')
     and new.scheduled_start <= now() then
    raise exception 'A scheduled appointment must start in the future';
  end if;

  if new.scheduled_start is not null
     and new.scheduled_end is not null
     and new.scheduled_end <= new.scheduled_start then
    raise exception 'An appointment must end after it starts';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_new_appointment_times on public.appointments;
create trigger trg_validate_new_appointment_times
before insert on public.appointments
for each row
execute function public.validate_new_appointment_times();
