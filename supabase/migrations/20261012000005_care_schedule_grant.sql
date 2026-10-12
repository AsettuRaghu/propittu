-- The server key runs scheduled bookings.
grant execute on function public.create_scheduled_request(uuid) to service_role;
