CREATE TABLE shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#B58A67', layout text NOT NULL DEFAULT 'grid',
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelves_layout_check CHECK (layout IN ('grid','list','shelf')),
  UNIQUE(owner_id,name), UNIQUE(id,owner_id)
);
ALTER TABLE books ADD CONSTRAINT books_id_owner_unique UNIQUE(id,owner_id);
ALTER TABLE books ADD COLUMN language text NOT NULL DEFAULT 'en-US';
ALTER TABLE books ADD COLUMN accent text NOT NULL DEFAULT '#B58A67';
ALTER TABLE books ADD COLUMN shelf_id uuid REFERENCES shelves(id) ON DELETE SET NULL;
ALTER TABLE books ADD COLUMN is_original boolean NOT NULL DEFAULT false;
ALTER TABLE books ADD COLUMN is_wishlist boolean NOT NULL DEFAULT false;
ALTER TABLE books ADD COLUMN content_revision integer NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN source_url text;
ALTER TABLE books ADD COLUMN license text;
ALTER TABLE books ADD COLUMN license_text text;
ALTER TABLE books ADD COLUMN demo_slug text;
CREATE UNIQUE INDEX books_demo_owner ON books(owner_id,demo_slug) WHERE demo_slug IS NOT NULL;
CREATE INDEX books_owner_shelf_order ON books(owner_id,shelf_id,created_at DESC,id DESC);
CREATE INDEX books_owner_wishlist ON books(owner_id,is_wishlist,created_at DESC,id DESC);
CREATE INDEX books_owner_title ON books(owner_id,lower(title));
CREATE TABLE chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL,
  owner_id text NOT NULL, title text NOT NULL, body text NOT NULL DEFAULT '',
  position integer NOT NULL, kind text NOT NULL DEFAULT 'body',
  CONSTRAINT chapters_book_owner_fk FOREIGN KEY(book_id,owner_id) REFERENCES books(id,owner_id) ON DELETE CASCADE,
  CONSTRAINT chapters_kind_check CHECK(kind IN ('body','glossary','frontmatter'))
);
CREATE INDEX chapters_book_position ON chapters(book_id,position,id);
CREATE TABLE book_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL,
  owner_id text NOT NULL, label text NOT NULL, author text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '', locator text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  CONSTRAINT references_book_owner_fk FOREIGN KEY(book_id,owner_id) REFERENCES books(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX references_book_position ON book_references(book_id,position);
ALTER TABLE notes ADD COLUMN chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL;
ALTER TABLE notes ADD COLUMN location text;
ALTER TABLE notes ADD COLUMN selected_text text NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN client_op_id uuid;
CREATE UNIQUE INDEX notes_owner_operation ON notes(owner_id,client_op_id) WHERE client_op_id IS NOT NULL;
CREATE INDEX notes_owner_book_created ON notes(owner_id,book_id,created_at DESC,id DESC);
CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE SET NULL, source_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  title text NOT NULL, body text NOT NULL, rating integer NOT NULL DEFAULT 5,
  theme text NOT NULL DEFAULT 'midnight', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(rating BETWEEN 1 AND 5), CHECK(theme IN ('midnight','parchment','ember'))
);
CREATE INDEX reviews_owner_created ON reviews(owner_id,created_at DESC,id DESC);
ALTER TABLE whisper_assets DROP CONSTRAINT whisper_assets_unique_params;
ALTER TABLE whisper_assets ADD CONSTRAINT whisper_assets_owner_params UNIQUE(owner_id,text_hash,voice,engine,locale);
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
