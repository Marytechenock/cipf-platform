import { getDb } from './db-postgres';
import fs from 'fs';
import path from 'path';

async function seed() {
    const db = getDb();
    console.log('Seeding database...');

    try {
        const data = JSON.parse(
            fs.readFileSync(path.join(process.cwd(), 'src', 'server', 'db.json'), 'utf8')
        );

        const seedData = [
            { name: 'Users', data: data.users, fn: db.saveUser },
            { name: 'Sessions', data: data.sessions, fn: db.saveSession },
            { name: 'Speakers', data: data.speakers, fn: db.saveSpeaker },
            { name: 'Sponsors', data: data.sponsors, fn: db.saveSponsor },
            { name: 'Testimonials', data: data.testimonials, fn: db.saveTestimonial },
            { name: 'Gallery', data: data.gallery, fn: db.saveGalleryImage },
            { name: 'Adventures', data: data.adventures, fn: db.saveAdventure },
            { name: 'Feedback', data: data.feedback, fn: db.saveFeedback },
        ];

        for (const { name, data, fn } of seedData) {
            console.log(`  Seeding ${name}...`);
            for (const item of data || []) {
                try {
                    await fn(item);
                } catch (error) {}
            }
        }

        if (data.venue) {
            console.log('  Seeding Venue...');
            await db.saveVenue(data.venue);
        }

        if (data.googleDriveLink) {
            console.log('  Seeding Google Drive...');
            await db.saveGoogleDriveLink(data.googleDriveLink);
        }

        console.log('Seeding completed successfully.');
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    } finally {
        await db.closePool();
        console.log('Database connection closed.');
    }
}

seed();
