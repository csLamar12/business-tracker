import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

async function resetSchool(subdomain: string) {
  const existing = await prisma.school.findUnique({ where: { subdomain } });
  if (existing) {
    // Cascades remove users + all content.
    await prisma.school.delete({ where: { id: existing.id } });
  }
}

async function main() {
  // ----- Platform super-admin -----
  const superEmail = (
    process.env.SUPERADMIN_EMAIL || "admin@schoolhubja.com"
  ).toLowerCase();
  const superPassword = process.env.SUPERADMIN_PASSWORD || "changeme123";

  await prisma.user.upsert({
    where: { email: superEmail },
    update: {},
    create: {
      email: superEmail,
      name: "Platform Admin",
      passwordHash: await bcrypt.hash(superPassword, 10),
      role: "SUPERADMIN",
      schoolId: null,
    },
  });
  console.log(`✓ Super-admin: ${superEmail} / ${superPassword}`);

  // ----- Sample school 1: Kingston College (Standard plan, subdomain) -----
  await resetSchool("kingston-college");
  const kc = await prisma.school.create({
    data: {
      name: "Kingston College",
      subdomain: "kingston-college",
      plan: "STANDARD",
      published: true,
      tagline: "The Brave May Fall, But Never Yield.",
      motto: "Fortis Cadere Cedere Non Potest",
      aboutHtml:
        "<p>Kingston College is a traditional high school for boys located in Kingston, Jamaica. Since our founding we have nurtured generations of scholars, athletes and leaders who carry the Purple and White with pride.</p><p>Our community is built on discipline, scholarship and an unconquerable spirit.</p>",
      primaryColor: "#5b2a86",
      secondaryColor: "#f5c518",
      logoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Crest.svg/200px-Crest.svg.png",
      heroImageUrl:
        "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=70",
      principalName: "Mr. Dave Myrie",
      foundedYear: 1925,
      addressLine: "North Street",
      parish: "Kingston",
      phone: "(876) 922-1000",
      email: "info@kingston-college.example",
      facebookUrl: "https://facebook.com/",
      instagramUrl: "https://instagram.com/",
      announcements: {
        create: [
          {
            title: "Reopening of School — September Term",
            body: "School reopens for the new academic year on Monday, September 7. Students are reminded to be in full uniform. Booklists are available from the school office.",
            pinned: true,
            publishedAt: daysFromNow(-2),
          },
          {
            title: "CSEC Results Collection",
            body: "CSEC results may be collected from the Guidance Department between 9:00am and 2:00pm. Please bring valid identification.",
            publishedAt: daysFromNow(-6),
          },
          {
            title: "Manning Cup Squad Announced",
            body: "Congratulations to the 30 players selected for this season's Manning Cup campaign. Training continues every weekday at 3:30pm.",
            publishedAt: daysFromNow(-10),
          },
          {
            title: "PTA General Meeting",
            body: "All parents and guardians are invited to the first PTA General Meeting of the year in the school auditorium.",
            publishedAt: daysFromNow(-14),
          },
        ],
      },
      calendar: {
        create: [
          {
            title: "Christmas Term Begins",
            category: "TERM",
            startDate: daysFromNow(5),
          },
          {
            title: "National Heroes Day (Holiday)",
            category: "HOLIDAY",
            startDate: daysFromNow(20),
          },
          {
            title: "Mid-Term Examinations",
            category: "EXAM",
            startDate: daysFromNow(40),
            endDate: daysFromNow(47),
          },
          {
            title: "Inter-House Sports Day",
            category: "SPORTS",
            startDate: daysFromNow(30),
          },
          {
            title: "PTA Meeting",
            category: "PTA",
            startDate: daysFromNow(12),
          },
          {
            title: "Christmas Break Begins",
            category: "HOLIDAY",
            startDate: daysFromNow(60),
            endDate: daysFromNow(74),
          },
        ],
      },
      events: {
        create: [
          {
            title: "Open Day 2026",
            description:
              "Prospective students and parents are invited to tour the campus, meet staff and learn about our programmes.",
            location: "KC Main Campus, North Street",
            startsAt: daysFromNow(15),
            imageUrl:
              "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=70",
          },
          {
            title: "Founders' Day Service",
            description:
              "Join us as we celebrate the founding of Kingston College with our annual thanksgiving service.",
            location: "School Chapel",
            startsAt: daysFromNow(25),
          },
          {
            title: "Annual Awards Ceremony",
            description:
              "Recognising academic excellence and outstanding achievement across all forms.",
            location: "School Auditorium",
            startsAt: daysFromNow(45),
          },
          {
            title: "Past Students' Reunion Dinner",
            description: "An evening of fellowship for old boys of all eras.",
            location: "The Jamaica Pegasus Hotel",
            startsAt: daysFromNow(-20),
          },
        ],
      },
      staff: {
        create: [
          {
            name: "Mr. Dave Myrie",
            title: "Principal",
            department: "Administration",
            bio: "Leading Kingston College with a commitment to academic and athletic excellence.",
            sortOrder: 0,
          },
          {
            name: "Mrs. Andrea Brown",
            title: "Vice Principal",
            department: "Administration",
            sortOrder: 1,
          },
          {
            name: "Mr. Leon Russell",
            title: "Head of Mathematics",
            department: "Mathematics",
            sortOrder: 2,
          },
          {
            name: "Ms. Patrice Campbell",
            title: "Head of Sciences",
            department: "Sciences",
            sortOrder: 3,
          },
          {
            name: "Mr. Headley Cunningham",
            title: "Director of Sports",
            department: "Physical Education",
            sortOrder: 4,
          },
          {
            name: "Mrs. Simone Lewis",
            title: "Guidance Counsellor",
            department: "Student Services",
            sortOrder: 5,
          },
        ],
      },
      achievements: {
        create: [
          {
            title: "ISSA Boys' Athletics Champions",
            studentName: "KC Track Team",
            category: "Sports",
            description:
              "Kingston College once again claimed the Boys' Champs title at the National Stadium.",
            achievedOn: daysFromNow(-90),
            imageUrl:
              "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=70",
          },
          {
            title: "12 CSEC Grade Ones",
            studentName: "Jamal Reid (6th Form)",
            category: "Academics",
            description:
              "An outstanding CSEC performance earning a national scholarship.",
            achievedOn: daysFromNow(-120),
          },
          {
            title: "National Schools' Debating Champions",
            studentName: "KC Debate Society",
            category: "Arts & Culture",
            achievedOn: daysFromNow(-150),
          },
        ],
      },
      alumni: {
        create: [
          {
            name: "Michael Grant",
            gradYear: 2005,
            currentRole: "Civil Engineer, NWA",
            message: "Proud to be an old boy. Fortis!",
            approved: true,
          },
          {
            name: "Andre Williams",
            gradYear: 1998,
            currentRole: "Medical Doctor, UHWI",
            approved: true,
          },
          {
            name: "Devon Smith",
            gradYear: 2012,
            currentRole: "Software Engineer",
            message: "KC built my discipline.",
            approved: true,
          },
          {
            name: "Recent Registrant",
            gradYear: 2015,
            currentRole: "Accountant",
            approved: false, // pending — shows up for admin approval
          },
        ],
      },
      admissions: {
        create: {
          introHtml:
            "<p>Kingston College welcomes applications from boys seeking a tradition of excellence. Entry is primarily through the Primary Exit Profile (PEP) placement.</p>",
          requirementsHtml:
            "<ul><li>PEP placement to Kingston College, or</li><li>Transfer request with satisfactory academic standing</li><li>Birth certificate and immunisation records</li><li>Two recent passport-sized photographs</li></ul>",
          processHtml:
            "<ol><li>Submit the completed application form with required documents.</li><li>Attend the registration session on the assigned date.</li><li>Receive your booklist and uniform requirements.</li></ol>",
          feesHtml:
            "<p>Auxiliary fees support student activities, technology and maintenance. Contact the bursar's office for the current schedule and payment plans.</p>",
          applyUrl: "https://www.gov.jm/",
          opensOn: daysFromNow(-30),
          closesOn: daysFromNow(30),
        },
      },
    },
  });

  await prisma.user.create({
    data: {
      email: "kc-admin@schoolhubja.com",
      name: "KC Webmaster",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "SCHOOL_ADMIN",
      schoolId: kc.id,
    },
  });
  console.log("✓ Kingston College (subdomain: kingston-college)");
  console.log("  admin: kc-admin@schoolhubja.com / password123");

  // ----- Sample school 2: Premium plan with a custom domain -----
  await resetSchool("st-andrew-high");
  const sah = await prisma.school.create({
    data: {
      name: "St. Andrew High School",
      subdomain: "st-andrew-high",
      plan: "PREMIUM",
      customDomain: "www.standrewhigh.example",
      published: true,
      tagline: "Knowledge · Service · Integrity",
      motto: "Per Ardua Ad Alta",
      primaryColor: "#0a6b3b",
      secondaryColor: "#d4af37",
      principalName: "Mrs. Sharon Reid",
      foundedYear: 1925,
      addressLine: "Cecelio Avenue",
      parish: "St. Andrew",
      announcements: {
        create: [
          {
            title: "Welcome to the New Academic Year",
            body: "We look forward to a year of growth, service and achievement. Welcome back, students!",
            pinned: true,
            publishedAt: daysFromNow(-1),
          },
        ],
      },
      staff: {
        create: [
          {
            name: "Mrs. Sharon Reid",
            title: "Principal",
            department: "Administration",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.user.create({
    data: {
      email: "sah-admin@schoolhubja.com",
      name: "SAHS Webmaster",
      passwordHash: await bcrypt.hash("password123", 10),
      role: "SCHOOL_ADMIN",
      schoolId: sah.id,
    },
  });
  console.log(
    "✓ St. Andrew High School (premium, custom domain: www.standrewhigh.example)",
  );
  console.log("  admin: sah-admin@schoolhubja.com / password123");

  // ----- A sample marketing enquiry -----
  await prisma.contactMessage.create({
    data: {
      name: "Janet Brown",
      email: "principal@example.edu.jm",
      schoolName: "Example High School",
      plan: "PREMIUM",
      message:
        "We're interested in a website with our own domain. Please contact us to discuss onboarding.",
    },
  });

  console.log("\nSeed complete. ✨");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
