"use client";

import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Contact } from "@/lib/types";

const addNewId = "__new__";

function contactDetail(contact: Contact) {
  return contact.email || contact.phone || contact.address || "Contact details";
}

export default function CustomerContactPicker({
  label,
  contacts,
  value,
  allowEmpty = false,
  onChange,
}: {
  label: string;
  contacts: Contact[];
  value: string;
  allowEmpty?: boolean;
  onChange: (contactId: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const selected = contacts.find((contact) => contact.id === value);
  const selectedLabel =
    value === addNewId
      ? "Add new contact"
      : selected?.name || (allowEmpty ? "No contact selected" : "");
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(selectedLabel);
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [selectedLabel]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search || query === selectedLabel) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.address]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
    );
  }, [contacts, query, selectedLabel]);
  const options = [
    { id: addNewId, label: "Add new contact" },
    ...(allowEmpty ? [{ id: "", label: "No contact selected" }] : []),
    ...filtered.map((contact) => ({ id: contact.id, label: contact.name })),
  ];

  function choose(contactId: string) {
    onChange(contactId);
    const contact = contacts.find((item) => item.id === contactId);
    setQuery(
      contactId === addNewId
        ? "Add new contact"
        : contact?.name || "No contact selected",
    );
    setOpen(false);
    setActiveIndex(0);
  }

  return (
    <div
      className="contact-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery(selectedLabel);
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name="contactId" value={value} />
      <div className="contact-picker-control">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          aria-expanded={open}
          aria-activedescendant={
            open ? `${id}-option-${activeIndex}` : undefined
          }
          value={query}
          placeholder="Search contacts"
          autoComplete="off"
          onFocus={(event) => {
            event.currentTarget.select();
            setOpen(true);
            setActiveIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
              setQuery(selectedLabel);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => {
                if (event.key === "ArrowDown")
                  return Math.min(current + 1, options.length - 1);
                return Math.max(current - 1, 0);
              });
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              choose(options[activeIndex]?.id ?? addNewId);
            }
          }}
        />
        <button
          type="button"
          className="contact-picker-toggle"
          aria-label={
            open ? "Close customer contacts" : "Open customer contacts"
          }
          tabIndex={-1}
          onClick={() => {
            setOpen((current) => !current);
            setActiveIndex(0);
          }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul
          id={`${id}-listbox`}
          className="contact-picker-list"
          role="listbox"
          aria-label="Customer contacts"
        >
          <li
            id={`${id}-option-0`}
            role="option"
            aria-selected={value === addNewId}
            data-active={activeIndex === 0}
            className="contact-picker-add"
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={() => choose(addNewId)}
          >
            <span className="contact-picker-icon">
              <Plus size={15} aria-hidden="true" />
            </span>
            <strong>Add new contact</strong>
            {value === addNewId && <Check size={15} aria-hidden="true" />}
          </li>
          {allowEmpty && (
            <li
              id={`${id}-option-1`}
              role="option"
              aria-selected={!value}
              data-active={activeIndex === 1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(1)}
              onClick={() => choose("")}
            >
              <span>
                <strong>No contact selected</strong>
                <small>Keep the current quote details</small>
              </span>
              {!value && <Check size={15} aria-hidden="true" />}
            </li>
          )}
          {filtered.map((contact, index) => {
            const optionIndex = index + (allowEmpty ? 2 : 1);
            return (
              <li
                key={contact.id}
                id={`${id}-option-${optionIndex}`}
                role="option"
                aria-selected={contact.id === value}
                data-active={activeIndex === optionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(optionIndex)}
                onClick={() => choose(contact.id)}
              >
                <span>
                  <strong>{contact.name}</strong>
                  <small>{contactDetail(contact)}</small>
                </span>
                {contact.id === value && <Check size={15} aria-hidden="true" />}
              </li>
            );
          })}
          {!filtered.length && (
            <li className="contact-picker-empty">No matching contacts</li>
          )}
        </ul>
      )}
    </div>
  );
}
