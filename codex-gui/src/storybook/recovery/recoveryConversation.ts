import {
  agentMessage,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

const conversation = [
  {
    question: "Help me plan a small community library website. What should readers find first?",
    answer: `## Start with the reader's next visit

Put opening hours, the street address, and the catalogue near the beginning of the home page. A reader arriving on a phone should be able to find a book or check whether the library is open without first reading the library's history.

The catalogue should show availability alongside each title. Explain whether a copy can be borrowed, reserved, or read only in the building. Keep the same wording on search results and book details so readers do not have to interpret a new status at every step.

### First release

- Search by title, author, or subject.
- Show today's opening hours and upcoming closures.
- Describe borrowing rules in plain language.
- Provide contact details for questions that require a librarian.

For the first release, keep account creation optional until a reader actually needs to reserve a book. Public information should remain available without signing in.`,
  },
  {
    question: "How should we organize the book details and reservation flow?",
    answer: `## Book details and reservations

Begin with the title, author, cover description, and a short summary. Follow those with the edition, language, and available formats. These details help readers distinguish similarly named books and choose a copy they can use.

| Copy status | Reader action | Information to show |
| --- | --- | --- |
| On the shelf | Reserve a copy | Collection location |
| On loan | Join the waiting list | Current queue length |
| Reference only | Plan a visit | Reading-room hours |

When a reader reserves a copy, show a confirmation with the collection deadline and a way to cancel. If the copy becomes unavailable before confirmation, retain the selected book and explain the new status beside the reservation action.

### Keep the request understandable

Ask for only the information needed to identify the reader. Display validation messages next to their fields, preserve entries when a request fails, and provide a clear retry action. A failed request must not look like a confirmed reservation.`,
  },
  {
    question: "Can you suggest an accessible reading experience for narrow screens?",
    answer: `## Reading on a narrow screen

Use a single reading column and let paragraphs wrap naturally. Keep headings descriptive so people can scan the page or navigate it with assistive technology. Long titles should wrap instead of pushing actions outside the screen.

Navigation should remain reachable while reading a long page. Opening a menu should preserve the reader's place, and closing it should allow them to continue from that position. The menu's own content must remain reachable when the screen is shorter than the list of destinations.

### Keyboard and touch

- Give every action a visible label or an accessible name.
- Keep focus indicators visible against both light and dark backgrounds.
- Make book links distinguishable from surrounding prose.
- Avoid placing essential instructions exclusively in hover content.

Tables may need their own horizontal scrolling when their columns cannot fit. Ordinary paragraphs should continue to fit the reading column. Check the page with enlarged text as well as a smaller browser window.`,
  },
  {
    question: "What information should the events page contain?",
    answer: `## Make each event easy to plan around

Each event needs a title, date, start and end times, location, and audience description. State whether registration is required and whether a parent or carer must attend. Include access information before the registration action.

For a weekly reading group, describe the next meeting separately from the general programme. Readers should be able to tell which details apply every week and which belong to a particular session.

### Example event outline

1. Saturday reading group, 10:00–11:00.
2. Meet in the ground-floor community room.
3. Bring a favourite short story, or choose one from the library.
4. Registration is free; accompanying carers do not need a separate booking.
5. Contact the library if you need a large-print copy in advance.

If an event is cancelled, keep its page available with a clear cancellation notice. People following an old link still need to understand what happened and how to find the next session.`,
  },
  {
    question: "How can staff keep the opening hours accurate without editing several pages?",
    answer: `## Keep one source for opening hours

Store the weekly schedule together with dated exceptions. The home page, visit page, and event information should all read from that same schedule. A holiday closure should override the usual hours for that date.

An example entry could look like this:

~~~json
{
  "date": "2026-12-24",
  "opensAt": "09:00",
  "closesAt": "13:00",
  "note": "Reduced holiday hours"
}
~~~

Staff should review the date and time zone before publishing an exception. Show a preview of the resulting public message so a morning closure is not accidentally presented as an all-day closure.

Keep a short record of who changed the schedule and when. That record supports corrections, while the public page only needs the current hours and a clear explanation of any exception.`,
  },
  {
    question: "Summarize the release checklist and the decisions that are still open.",
    answer: `## Release checklist

The initial release covers finding books, planning a visit, and understanding upcoming events. Readers can browse without an account and sign in when a reservation requires it. Staff maintain one opening-hours schedule with dated exceptions.

### Before publication

- Review the address, contact details, and collection instructions.
- Confirm that unavailable books explain the next available action.
- Read the catalogue and event pages at narrow and wide widths.
- Check that menu navigation preserves the current reading position.
- Confirm that a failed reservation retains the reader's entries.
- Review headings, link names, and keyboard navigation.

### Decisions still open

The library needs to choose a reservation collection deadline and decide who receives questions submitted through the contact form. Staff should also agree on the wording used when the waiting time for a book is unknown.

Once those decisions are recorded, review the public pages with a librarian and a reader who has not seen the project before. Their questions will help identify missing information before the site is published.`,
  },
];

export function recoveryConversationTurns(label: string) {
  return conversation.map(({ question, answer }, index) => {
    const id = `recovery-conversation-${label}-${String(index + 1)}`;
    return baseTurn(id, [
      userMessage(`${id}-question`, [textInput(question)]),
      agentMessage(`${id}-answer`, answer),
    ]);
  });
}
