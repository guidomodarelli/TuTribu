import {
  buildMembersCsv,
  buildMembersExportFilename,
  buildMembersHtml,
  MEMBER_EXPORT_FORMAT,
} from "@/components/tribes/tribe-member-directory/export";
import type { TribeMemberResult } from "@/src/modules/tribes/application/results/tribe-member-result";

const members: TribeMemberResult[] = [
  {
    avatarFallback: "AL",
    email: "ada.lovelace@example.com",
    id: "member-1",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Ada Lovelace",
    role: "leader",
  },
  {
    avatarFallback: "GH",
    email: 'grace,"the queen"@example.com',
    id: "member-2",
    image: null,
    joinedViaFreeInvitation: false,
    name: "Grace <Hopper>",
    role: "tribemate",
  },
];

const selectionsByMemberId = {
  "member-1": [
    { count: 2, id: "link-1", label: "Soporte" },
    { count: 1, id: "link-2", label: "Mentoría" },
  ],
};

describe("tribe member directory export", () => {
  describe("buildMembersCsv", () => {
    it("renders a header row with the Spanish column names", () => {
      const csv = buildMembersCsv([], {});

      expect(csv).toBe("Nombre,Email,Rol,Elecciones");
    });

    it("escapes CSV-unsafe characters and joins selections with semicolons", () => {
      const csv = buildMembersCsv(members, selectionsByMemberId);
      const lines = csv.split("\r\n");

      expect(lines[0]).toBe("Nombre,Email,Rol,Elecciones");
      expect(lines[1]).toBe(
        "Ada Lovelace,ada.lovelace@example.com,Líder,Soporte (2); Mentoría (1)"
      );
      expect(lines[2]).toBe(
        'Grace <Hopper>,"grace,""the queen""@example.com",Miembro,Sin elecciones'
      );
    });

    it("neutralizes formula-like CSV fields before exporting user-controlled values", () => {
      const csv = buildMembersCsv(
        [
          {
            avatarFallback: "FO",
            email: "+formula@example.com",
            id: "member-formula",
            image: null,
            joinedViaFreeInvitation: false,
            name: "=SUM(1)",
            role: "tribemate",
          },
        ],
        {
          "member-formula": [{ count: 1, id: "link-1", label: "-Soporte" }],
        }
      );

      expect(csv.split("\r\n")[1]).toBe(
        "'=SUM(1),'+formula@example.com,Miembro,'-Soporte (1)"
      );
    });

    it("renders an empty email column when the member email is hidden", () => {
      const csv = buildMembersCsv(
        [
          {
            avatarFallback: "AL",
            email: null,
            id: "member-1",
            image: null,
            joinedViaFreeInvitation: false,
            name: "Ada Lovelace",
            role: "tribemate",
          },
        ],
        {}
      );

      expect(csv.split("\r\n")[1]).toBe("Ada Lovelace,,Miembro,Sin elecciones");
    });

    it("neutralizes tab-prefixed formula-like CSV fields", () => {
      const csv = buildMembersCsv(
        [
          {
            avatarFallback: "TA",
            email: "tab@example.com",
            id: "member-tab",
            image: null,
            joinedViaFreeInvitation: false,
            name: "\t=SUM(1)",
            role: "tribemate",
          },
        ],
        {}
      );

      expect(csv.split("\r\n")[1]).toBe(
        "'\t=SUM(1),tab@example.com,Miembro,Sin elecciones"
      );
    });
  });

  describe("buildMembersHtml", () => {
    it("escapes HTML entities in names, emails, and tribe slug", () => {
      const html = buildMembersHtml(members, selectionsByMemberId, "tribe&co");

      expect(html).toContain("<title>Miembros de tribe&amp;co</title>");
      expect(html).toContain("<td>Grace &lt;Hopper&gt;</td>");
      expect(html).toContain(
        "<td>grace,&quot;the queen&quot;@example.com</td>"
      );
      expect(html).toContain("<td>Soporte (2); Mentoría (1)</td>");
      expect(html).toContain("<td>Sin elecciones</td>");
    });

    it("renders an empty email cell when the member email is hidden", () => {
      const html = buildMembersHtml(
        [
          {
            avatarFallback: "AL",
            email: null,
            id: "member-1",
            image: null,
            joinedViaFreeInvitation: false,
            name: "Ada Lovelace",
            role: "tribemate",
          },
        ],
        {},
        "matematica-pro"
      );

      expect(html).toContain("<td>Ada Lovelace</td>");
      expect(html).toContain("<td></td>");
    });

    it("keeps escaped user values that look like HTML template placeholders unchanged", () => {
      const html = buildMembersHtml(
        [
          {
            avatarFallback: "TE",
            email: "{{role}}@example.com",
            id: "member-template",
            image: null,
            joinedViaFreeInvitation: false,
            name: "{{email}}",
            role: "tribemate",
          },
        ],
        {},
        "matematica-pro"
      );

      expect(html).toContain("<td>{{email}}</td>");
      expect(html).toContain("<td>{{role}}@example.com</td>");
    });
  });

  describe("buildMembersExportFilename", () => {
    it("builds a sluggified filename with date and extension", () => {
      const filename = buildMembersExportFilename(
        "Matemática Pro!",
        MEMBER_EXPORT_FORMAT.csv,
        new Date("2026-05-24T10:00:00Z")
      );

      expect(filename).toBe("miembros-matem-tica-pro-2026-05-24.csv");
    });

    it("falls back to a default slug when the tribe slug is empty", () => {
      const filename = buildMembersExportFilename(
        "   ",
        MEMBER_EXPORT_FORMAT.html,
        new Date("2026-05-24T10:00:00Z")
      );

      expect(filename).toBe("miembros-tribu-2026-05-24.html");
    });
  });
});
