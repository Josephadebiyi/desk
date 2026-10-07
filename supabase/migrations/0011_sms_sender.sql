-- ZionDesk — each church's SMS sender name (alphanumeric sender ID, up to 11 letters/numbers/spaces).
-- Null = made from the church name. Used for SMS broadcasts where carriers accept sender names.
alter table churches add column if not exists sms_sender text;
alter table churches drop constraint if exists churches_sms_sender_check;
alter table churches add constraint churches_sms_sender_check check (sms_sender is null or sms_sender ~ '^[A-Za-z0-9 ]{1,11}$' and sms_sender ~ '[A-Za-z]');
