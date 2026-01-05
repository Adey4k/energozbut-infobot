const admin = require('firebase-admin');

// 1. Mocks
const mockFirestore = {
  collection: jest.fn(),
  batch: jest.fn(),
};

const mockCollection = {
  doc: jest.fn(),
  where: jest.fn(),
};

const mockDoc = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  ref: 'mock-ref'
};

const mockQuery = {
  where: jest.fn(), // <--- ДОДАНО: Для підтримки ланцюжків .where().where()
  limit: jest.fn(),
  get: jest.fn(),
};

const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  commit: jest.fn(),
};

// 2. Mock firebase-admin
jest.mock('firebase-admin', () => {
  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: Object.assign(() => mockFirestore, {
      FieldValue: {
        serverTimestamp: jest.fn(() => 'MOCK_TIMESTAMP'),
      },
    }),
  };
});

// 3. Import service
const { checkAndLinkUser } = require('../utils/authService');

describe('checkAndLinkUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Wiring mocks
    mockFirestore.collection.mockReturnValue(mockCollection);
    mockFirestore.batch.mockReturnValue(mockBatch);
    
    mockCollection.doc.mockReturnValue(mockDoc);
    mockCollection.where.mockReturnValue(mockQuery);
    
    // <--- ДОДАНО: Налаштування для ланцюжка
    mockQuery.where.mockReturnValue(mockQuery); 
    mockQuery.limit.mockReturnValue(mockQuery);
  });

  test('should block user if they are already banned', async () => {
    mockDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ isBanned: true })
    });

    const result = await checkAndLinkUser(12345, '100', '200');

    expect(result.success).toBe(false);
    expect(result.isBanned).toBe(true);
  });

  test('should return success if user is already linked', async () => {
    mockDoc.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({ linkedDocId: 'secret_123' })
    });

    const result = await checkAndLinkUser(12345, '100', '200');

    expect(result.success).toBe(true);
    expect(result.alreadyLinked).toBe(true);
  });

  test('should fail if secret data is incorrect (not found)', async () => {
    mockDoc.get.mockResolvedValueOnce({ exists: false });
    mockQuery.get.mockResolvedValueOnce({ empty: true });
    mockDoc.set.mockResolvedValue(true);

    const result = await checkAndLinkUser(12345, '100', '200');

    expect(result.success).toBe(false);
    expect(mockFirestore.collection).toHaveBeenCalledWith('secrets');
    expect(mockDoc.set).toHaveBeenCalledWith({ attempts: 1 }, { merge: true });
  });

  test('should ban user after 5 failed attempts', async () => {
    mockDoc.get.mockResolvedValueOnce({ 
      exists: true, 
      data: () => ({ attempts: 4 }) 
    });
    
    mockQuery.get.mockResolvedValueOnce({ empty: true });

    const result = await checkAndLinkUser(12345, '100', '200');

    expect(result.success).toBe(false);
    expect(result.isBanned).toBe(true);
    expect(mockDoc.set).toHaveBeenCalledWith({ attempts: 5, isBanned: true }, { merge: true });
  });

  test('should successfully link user when data is valid', async () => {
    // 1. User check (clean)
    mockDoc.get.mockResolvedValueOnce({ exists: false });

    const secretDocData = { usedBy: null, contragent: 'Test User' };
    const secretDocSnap = {
      id: 'secret_doc_id',
      data: () => secretDocData,
      ref: 'secret_ref'
    };
    
    // 2. Secret search (found)
    mockQuery.get.mockResolvedValueOnce({ 
      empty: false, 
      docs: [secretDocSnap] 
    });

    // 3. Final data fetch
    mockDoc.get.mockResolvedValueOnce({
       exists: true, 
       data: () => secretDocData 
    });

    const result = await checkAndLinkUser(12345, '100', '200');

    expect(result.success).toBe(true);
    expect(mockBatch.commit).toHaveBeenCalled();
    expect(mockBatch.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      linkedDocId: 'secret_doc_id',
      attempts: 0
    }), { merge: true });
  });
});