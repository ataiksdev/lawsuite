# This file is intentionally empty.
# The matter_notes table is now mapped by app.models.note.Note
# (with matter_id nullable — see migration d1e2f3a4b5c6).
#
# Legacy aliases MatterNote and MatterNoteType are re-exported from
# app.models.__init__ pointing at Note and NoteType, so any external
# code that imported from this module still works.
