-- VTrain beta: run in Neon SQL Editor for the intended database.
-- Additive and safe to repeat; does not overwrite existing accounts or words.
BEGIN;
CREATE TABLE IF NOT EXISTS teams(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY, team_id uuid NOT NULL REFERENCES teams(id), email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, locale text NOT NULL CHECK(locale IN ('de','pt')), target text NOT NULL CHECK(target IN ('de','pt')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS cards(id text PRIMARY KEY,team_id uuid REFERENCES teams(id),creator_id uuid REFERENCES users(id),de text NOT NULL,pt text NOT NULL,example text NOT NULL DEFAULT '',note text NOT NULL DEFAULT '',category text NOT NULL DEFAULT 'Alltag',audio jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS progress(user_id uuid REFERENCES users(id) ON DELETE CASCADE,card_id text REFERENCES cards(id) ON DELETE CASCADE,level integer NOT NULL DEFAULT 0 CHECK(level BETWEEN 0 AND 6),due timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,card_id));
CREATE TABLE IF NOT EXISTS reviews(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,card_id text NOT NULL REFERENCES cards(id),correct boolean NOT NULL,xp integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS reviews_user_time ON reviews(user_id,created_at);
CREATE TABLE IF NOT EXISTS auth_limits(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
INSERT INTO teams(id,name) VALUES('11111111-1111-4111-8111-111111111111','Unser Tandem') ON CONFLICT DO NOTHING;

INSERT INTO cards(id,de,pt,example,note,category) VALUES
('starter-1','Guten Morgen','Bom dia','Bom dia! Como você está?','Begrüßung · Cumprimento','Starter'),
('starter-2','Guten Abend','Boa noite','Boa noite! Até amanhã.','Begrüßung · Cumprimento','Starter'),
('starter-3','Danke','Obrigado | Obrigada','Muito obrigado pela ajuda!','Obrigado: männlicher Sprecher; obrigada: weibliche Sprecherin.','Starter'),
('starter-4','Bitte','Por favor','Um café, por favor.','Höfliche Bitte · Pedido educado','Starter'),
('starter-5','Wie geht es dir','Como você está','Oi! Como você está?','Informell auch: Tudo bem?','Starter'),
('starter-6','das Wasser','a água','Eu gostaria de uma água.','Artikel mitlernen · Aprenda com o artigo','Starter'),
('starter-7','der Kaffee','o café','O café está muito bom.','Plural: die Kaffees / os cafés','Starter'),
('starter-8','das Brot','o pão','Eu compro pão todos os dias.','Plural: die Brote / os pães','Starter'),
('starter-9','der Freund','o amigo','Ele é meu amigo.','die Freundin / a amiga','Starter'),
('starter-10','die Familie','a família','Minha família mora no Brasil.','Plural: die Familien / as famílias','Starter'),
('starter-11','lernen','aprender','Nós queremos aprender juntos.','ich lerne / eu aprendo','Starter'),
('starter-12','sprechen','falar','Você fala alemão?','ich spreche / eu falo','Starter'),
('starter-13','verstehen','entender','Eu não entendo.','ich verstehe / eu entendo','Starter'),
('starter-14','langsam','devagar','Pode falar mais devagar?','Beim Sprechen um ein langsameres Tempo bitten.','Starter'),
('starter-15','heute','hoje','Hoje eu vou estudar.','Zeitangabe · Expressão de tempo','Starter'),
('starter-16','morgen','amanhã','Até amanhã!','Zeitangabe · Expressão de tempo','Starter'),
('starter-17','zusammen','juntos | juntas','Vamos aprender juntos.','juntas: nur weibliche Personen; juntos: männlich oder gemischt.','Starter'),
('starter-18','Ich vermisse dich','Estou com saudade de você','Estou com muita saudade de você.','Saudade beschreibt das Gefühl, jemanden oder etwas zu vermissen.','Starter'),
('starter-19','Wo ist der Bahnhof','Onde fica a estação de trem','Com licença, onde fica a estação de trem?','Unterwegs · Na cidade','Starter'),
('starter-20','Ich hätte gern einen Kaffee','Eu gostaria de um café','Eu gostaria de um café, por favor.','Im Café · No café','Starter')
ON CONFLICT(id) DO NOTHING;
COMMIT;
