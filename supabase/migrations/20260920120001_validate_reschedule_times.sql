begin;

-- Keep reschedule times valid even when a caller bypasses the UI and writes
-- directly through PostgREST or an Edge Function.
create or replace function public.validate_appointment_reschedule_times()
returns trigger
language plpgsql
as $$
begin
  if new.proposed_start is distinct from old.proposed_start
     or new.proposed_end is distinct from old.proposed_end then
    if new.proposed_start is not null and new.proposed_start <= now() then
      raise exception 'A proposed reschedule must start in the future';
    end if;

    if new.proposed_start is not null
       and new.proposed_end is not null
       and new.proposed_end <= new.proposed_start then
      raise exception 'A proposed reschedule must end after it starts';
    end if;
  end if;

  -- Direct salon reschedules update scheduled_start/scheduled_end. Only check
  -- the start when it changes, so editing an old appointment's notes/status
  -- does not retroactively invalidate the record.
  if new.scheduled_start is distinct from old.scheduled_start
     and new.scheduled_start is not null
     and new.scheduled_start <= now()
     and new.status in ('scheduled', 'rescheduled') then
    raise exception 'A rescheduled appointment must start in the future';
  end if;

  if new.scheduled_start is distinct from old.scheduled_start
     or new.scheduled_end is distinct from old.scheduled_end then
    if new.scheduled_start is not null
       and new.scheduled_end is not null
       and new.scheduled_end <= new.scheduled_start then
      raise exception 'An appointment must end after it starts';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_appointment_reschedule_times on public.appointments;
create trigger trg_validate_appointment_reschedule_times
before update of scheduled_start, scheduled_end, proposed_start, proposed_end
on public.appointments
for each row
execute function public.validate_appointment_reschedule_times();

commit;
